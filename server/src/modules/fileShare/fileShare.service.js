import { AppError } from '../../utils/AppError.js';
import { randomToken } from '../../utils/crypto.js';
import { StoredFile } from '../files/file.model.js';
import { createFileUrl, createPreviewUrls, toFileDto } from '../files/files.service.js';
import { hiddenFolderIds } from '../files/folderAccess.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { FileShare } from './fileShare.model.js';

const DUPLICATE_KEY = 11000;
const LIST_LIMIT = 200;

// ---------------------------------------------------------------------------
// Managing links (workspace editors, from inside the app)

function filesNotFound() {
  return AppError.notFound(
    'One of these files no longer exists or is in the Trash',
    'FILE_NOT_FOUND',
  );
}

function shareNotFound() {
  return AppError.notFound('This share link no longer exists', 'SHARE_NOT_FOUND');
}

// Only live files the viewer can open may go into a link.
async function assertShareableFiles(workspaceId, fileIds, viewer) {
  const [files, hidden] = await Promise.all([
    StoredFile.find({ _id: { $in: fileIds }, workspaceId, deletedAt: null })
      .select('folderId')
      .lean(),
    hiddenFolderIds(workspaceId, viewer),
  ]);
  if (files.length !== fileIds.length) throw filesNotFound();
  if (files.some((file) => hidden.has(String(file.folderId)))) throw filesNotFound();
}

// Links with their live files attached, minus the links this viewer may not
// see: a link is visible to whoever made it and to anyone who can open every
// file in it (so a link into a restricted folder never leaks its file names).
async function toVisibleDtos(workspaceId, shares, viewer) {
  const allIds = shares.flatMap((share) => share.fileIds);
  const [files, hidden] = await Promise.all([
    StoredFile.find({ _id: { $in: allIds }, workspaceId, deletedAt: null })
      .select('displayName category size folderId')
      .lean(),
    hiddenFolderIds(workspaceId, viewer),
  ]);
  const byId = new Map(files.map((file) => [String(file._id), file]));

  return shares.flatMap((share) => {
    const live = share.fileIds.map((id) => byId.get(String(id))).filter(Boolean);
    const isMine = String(share.createdBy?._id ?? share.createdBy) === viewer.userId;
    if (!isMine && live.some((file) => hidden.has(String(file.folderId)))) return [];
    return [
      {
        id: String(share._id),
        token: share.token,
        audience: share.audience,
        files: live.map((file) => ({
          id: String(file._id),
          name: file.displayName,
          category: file.category,
          size: file.size,
        })),
        createdBy: share.createdBy?.name ? { name: share.createdBy.name } : null,
        isMine,
        createdAt: share.createdAt,
      },
    ];
  });
}

async function findVisibleShare(workspaceId, shareId, viewer) {
  const share = await FileShare.findOne({ _id: shareId, workspaceId })
    .populate('createdBy', 'name')
    .lean();
  const [dto] = share ? await toVisibleDtos(workspaceId, [share], viewer) : [];
  if (!dto) throw shareNotFound();
  return dto;
}

function exactSetFilter(workspaceId, fileIds) {
  return { workspaceId, fileIds: { $all: fileIds, $size: fileIds.length } };
}

export async function listFileShares(workspaceId, viewer) {
  const shares = await FileShare.find({ workspaceId })
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .populate('createdBy', 'name')
    .lean();
  const visible = await toVisibleDtos(workspaceId, shares, viewer);
  // A link whose files all sit in the Trash opens nothing; leave it out.
  return visible.filter((share) => share.files.length > 0);
}

// The link that shares exactly these files, or null when there is none yet.
export async function findFileShare(workspaceId, fileIds, viewer) {
  await assertShareableFiles(workspaceId, fileIds, viewer);
  const share = await FileShare.findOne(exactSetFilter(workspaceId, fileIds))
    .populate('createdBy', 'name')
    .lean();
  if (!share) return null;
  const [dto] = await toVisibleDtos(workspaceId, [share], viewer);
  return dto ?? null;
}

// One link per set of files: sharing the same files again returns the link
// they already have (with the audience asked for now).
export async function createFileShare(workspaceId, userId, { fileIds, audience }, viewer) {
  await assertShareableFiles(workspaceId, fileIds, viewer);

  const existing = await FileShare.findOneAndUpdate(
    exactSetFilter(workspaceId, fileIds),
    { $set: { audience } },
    { new: true, runValidators: true },
  ).lean();
  if (existing) return findVisibleShare(workspaceId, existing._id, viewer);

  // A token clash is astronomically unlikely, but the unique index would
  // reject it, so retry once.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const share = await FileShare.create({
        workspaceId,
        token: randomToken(24),
        fileIds,
        audience,
        createdBy: userId,
      });
      return findVisibleShare(workspaceId, share._id, viewer);
    } catch (err) {
      if (err.code !== DUPLICATE_KEY || attempt > 0) throw err;
    }
  }
}

export async function updateFileShare(workspaceId, shareId, { audience }, viewer) {
  await findVisibleShare(workspaceId, shareId, viewer);
  await FileShare.updateOne(
    { _id: shareId, workspaceId },
    { $set: { audience } },
    { runValidators: true },
  );
  return findVisibleShare(workspaceId, shareId, viewer);
}

// Whoever had the link loses access straight away.
export async function deleteFileShare(workspaceId, shareId, viewer) {
  await findVisibleShare(workspaceId, shareId, viewer);
  await FileShare.deleteOne({ _id: shareId, workspaceId });
}

// ---------------------------------------------------------------------------
// Using a link (anyone holding it; req.user may be null)

function linkNotFound() {
  return AppError.notFound(
    'This share link does not exist or has been turned off',
    'SHARE_NOT_FOUND',
  );
}

export async function resolveFileShare(token, user) {
  const share = await FileShare.findOne({ token })
    .setOptions({ crossWorkspace: true })
    .select('workspaceId fileIds audience')
    .lean();
  if (!share) throw linkNotFound();
  if (!(await Workspace.exists({ _id: share.workspaceId }))) throw linkNotFound();

  if (share.audience === 'signed_in' && !user) {
    throw AppError.unauthorized('Sign in to open these files', 'SIGN_IN_REQUIRED');
  }
  return share;
}

// The link's files that are still live, in the order they were shared. The
// person who made the link chose these files, so folder restrictions (which
// are about team members) don't apply here; files moved to Trash drop out.
async function liveSharedFiles(share, fileIds = share.fileIds) {
  const shared = new Set(share.fileIds.map(String));
  const wanted = fileIds.map(String).filter((id) => shared.has(id));
  if (wanted.length === 0) return [];
  const files = await StoredFile.find({
    _id: { $in: wanted },
    workspaceId: share.workspaceId,
    deletedAt: null,
  }).lean();
  const byId = new Map(files.map((file) => [String(file._id), file]));
  return wanted.map((id) => byId.get(id)).filter(Boolean);
}

// Visitors get what they need to view and download, nothing about where the
// file lives, who uploaded it or what the team wrote on it.
function publicFile(file) {
  const dto = toFileDto(file);
  return {
    id: dto.id,
    name: dto.name,
    extension: dto.extension,
    category: dto.category,
    size: dto.size,
    mime: dto.mime,
    previewable: dto.previewable,
    createdAt: dto.createdAt,
  };
}

export async function getSharedFiles(share, user) {
  const [files, workspace] = await Promise.all([
    liveSharedFiles(share),
    Workspace.findById(share.workspaceId).select('name').lean(),
  ]);
  if (files.length === 0) throw linkNotFound();
  return {
    files: files.map(publicFile),
    workspace: { name: workspace?.name ?? '' },
    access: { audience: share.audience, viewer: user ? { name: user.name } : null },
  };
}

export async function createSharedFileUrl(share, fileId, { disposition }) {
  const [file] = await liveSharedFiles(share, [fileId]);
  if (!file) throw AppError.notFound('File not found', 'FILE_NOT_FOUND');
  return createFileUrl(share.workspaceId, file._id, { disposition });
}

export async function createSharedPreviewUrls(share, fileIds) {
  const files = await liveSharedFiles(share, fileIds);
  return createPreviewUrls(
    share.workspaceId,
    files.map((file) => file._id),
  );
}
