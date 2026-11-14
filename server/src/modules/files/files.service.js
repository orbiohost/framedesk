import { deleteInsightsForFiles } from '../ai/aiInsight.model.js';
import { storageConfig } from '../../config/storage.js';
import { getStorageDriver } from '../../storage/storageDriver.js';
import { AppError } from '../../utils/AppError.js';
import { sanitizeFileName } from '../../utils/fileNames.js';
import { logger } from '../../utils/logger.js';
import { removeFilesFromShares } from '../fileShare/fileShare.model.js';
import { deleteTranscriptsForFiles } from '../transcripts/transcripts.service.js';
import { withoutUndefined } from '../../utils/objects.js';
import { Project } from '../projects/project.model.js';
import { StoredFile } from './file.model.js';
import { correctedMime, extensionOf, inlineMime, isPreviewable } from './fileTypes.js';
import { assertFolderAccess, hiddenFolderIds } from './folderAccess.js';
import { fallbackFolderId, findFolderOrThrow } from './folders.service.js';
import { releaseStorage, reserveStorage } from './storageQuota.service.js';

const PAGE_SIZE = 100;

// Linked projects come populated ({ _id, title }) from lists and single reads,
// and as bare ids elsewhere. Projects deleted since are dropped by populate.
function linkedProjectsOf(file) {
  return (file.linkedProjectIds ?? [])
    .filter(Boolean)
    .map((project) =>
      project.title === undefined
        ? { id: String(project), title: null }
        : { id: String(project._id), title: project.title },
    );
}

function populateFileRefs(query, workspaceId) {
  return query
    .populate('uploadedBy', 'name')
    .populate({ path: 'linkedProjectIds', select: 'title', match: { workspaceId } });
}

export function toFileDto(file) {
  const uploader = file.uploadedBy;
  const linkedProjects = linkedProjectsOf(file);
  // Fixes HEIC photos stored before the upload check knew all HEIF brands.
  const mime = correctedMime(file.mime, file.extension);
  return {
    id: String(file._id),
    name: file.displayName,
    extension: file.extension,
    category: file.category,
    size: file.size,
    mime,
    previewable: isPreviewable(mime, file.extension),
    status: file.status,
    version: file.version,
    tags: file.tags,
    linkedProjectIds: linkedProjects.map((project) => project.id),
    linkedProjects,
    note: file.note ?? '',
    folderId: String(file.folderId),
    projectId: file.projectId ? String(file.projectId) : null,
    uploadedBy: uploader?.name ? { id: String(uploader._id), name: uploader.name } : null,
    createdAt: file.createdAt,
    deletedAt: file.deletedAt,
  };
}

function fileNotFound() {
  return AppError.notFound('File not found', 'FILE_NOT_FOUND');
}

// A file inside a folder the viewer can't open looks like it doesn't exist.
async function findFileOrThrow(workspaceId, fileId, viewer = null) {
  const file = await StoredFile.findOne({ _id: fileId, workspaceId }).lean();
  if (!file) throw fileNotFound();
  const hidden = await hiddenFolderIds(workspaceId, viewer);
  if (hidden.has(String(file.folderId))) throw fileNotFound();
  return file;
}

async function getFileDto(workspaceId, fileId) {
  const file = await populateFileRefs(
    StoredFile.findOne({ _id: fileId, workspaceId }),
    workspaceId,
  ).lean();
  return toFileDto(file);
}

// The projects a file may be linked to: real projects of this workspace, never
// the project the file already lives in. Returns the cleaned list of ids.
export async function resolveLinkedProjectIds(workspaceId, ids, ownProjectId = null) {
  const wanted = [...new Set((ids ?? []).map(String))].filter(
    (id) => id !== String(ownProjectId ?? ''),
  );
  if (wanted.length === 0) return [];
  const found = await Project.countDocuments({ workspaceId, _id: { $in: wanted } });
  if (found !== wanted.length) {
    throw AppError.badRequest('One of the linked projects no longer exists', 'PROJECT_NOT_FOUND');
  }
  return wanted;
}

// Newest first; pass the returned nextCursor to get the following page.
export async function listFiles(
  workspaceId,
  { folderId, projectId, linkedProjectId, trashed, cursor },
  viewer = null,
) {
  const hidden = await hiddenFolderIds(workspaceId, viewer);
  if (!trashed && folderId && hidden.has(String(folderId))) {
    throw AppError.notFound('Folder not found', 'FOLDER_NOT_FOUND');
  }
  // Four lists: a trash, one folder, the files linked to a project from
  // elsewhere, or (projectId alone) every live file of a project.
  let filter;
  if (trashed) filter = { workspaceId, projectId: projectId ?? null, deletedAt: { $ne: null } };
  else if (folderId) filter = { workspaceId, folderId, deletedAt: null };
  else if (linkedProjectId)
    filter = { workspaceId, linkedProjectIds: linkedProjectId, deletedAt: null };
  else filter = { workspaceId, projectId, deletedAt: null };
  // Lists that span folders leave out the folders the viewer can't open.
  if (!filter.folderId && hidden.size > 0) filter.folderId = { $nin: [...hidden] };
  if (cursor) filter._id = { $lt: cursor };

  const files = await populateFileRefs(
    StoredFile.find(filter)
      .sort({ _id: -1 })
      .limit(PAGE_SIZE + 1),
    workspaceId,
  ).lean();

  const hasMore = files.length > PAGE_SIZE;
  const page = hasMore ? files.slice(0, PAGE_SIZE) : files;
  return { files: page.map(toFileDto), nextCursor: hasMore ? String(page.at(-1)._id) : null };
}

// A rename keeps the original extension, so "Final cut" stays an .mp4.
function renamedDisplayName(file, requestedName) {
  const name = sanitizeFileName(requestedName);
  if (!name) throw AppError.badRequest('Give the file a name', 'NAME_REQUIRED');
  return extensionOf(name) === file.extension ? name : `${name}.${file.extension}`;
}

export async function updateFile(
  workspaceId,
  fileId,
  { name, folderId, status, tags, linkedProjectIds, note },
  viewer = null,
) {
  const file = await findFileOrThrow(workspaceId, fileId, viewer);
  if (file.deletedAt)
    throw AppError.badRequest('Restore this file before changing it', 'FILE_IN_TRASH');

  if (folderId) {
    const folder = await findFolderOrThrow(workspaceId, folderId);
    await assertFolderAccess(workspaceId, folderId, viewer);
    if (String(folder.projectId ?? null) !== String(file.projectId ?? null)) {
      throw AppError.badRequest(
        'Files can only move between folders of the same project (or within the Drive)',
        'WRONG_PROJECT',
      );
    }
  }

  const changes = withoutUndefined({
    displayName: name === undefined ? undefined : renamedDisplayName(file, name),
    folderId,
    status,
    tags,
    linkedProjectIds:
      linkedProjectIds === undefined
        ? undefined
        : await resolveLinkedProjectIds(workspaceId, linkedProjectIds, file.projectId),
    note,
  });
  await StoredFile.updateOne(
    { _id: fileId, workspaceId },
    { $set: changes },
    { runValidators: true },
  );
  return getFileDto(workspaceId, fileId);
}

// Moving a file to Trash frees its space straight away, so the storage meter
// moves when someone deletes a file. Restoring claims the space back.
export async function trashFile(workspaceId, fileId, userId, viewer = null) {
  const file = await findFileOrThrow(workspaceId, fileId, viewer);
  const result = await StoredFile.updateOne(
    { _id: fileId, workspaceId, deletedAt: null },
    { $set: { deletedAt: new Date(), deletedBy: userId } },
  );
  if (result.modifiedCount === 1) await releaseStorage(workspaceId, file.size);
  return getFileDto(workspaceId, fileId);
}

export async function restoreFile(workspaceId, fileId, viewer = null) {
  const file = await findFileOrThrow(workspaceId, fileId, viewer);
  if (!file.deletedAt) return getFileDto(workspaceId, fileId);

  const folderStillExists = await findFolderOrThrow(workspaceId, file.folderId).catch(() => null);
  const folderId = folderStillExists
    ? file.folderId
    : await fallbackFolderId(workspaceId, file.projectId);

  // Claim the space first (throws STORAGE_FULL if it no longer fits).
  await reserveStorage(workspaceId, file.size);
  const result = await StoredFile.updateOne(
    { _id: fileId, workspaceId, deletedAt: { $ne: null } },
    { $set: { deletedAt: null, deletedBy: null, folderId } },
  );
  if (result.modifiedCount !== 1) await releaseStorage(workspaceId, file.size);
  return getFileDto(workspaceId, fileId);
}

export async function deleteFilePermanently(workspaceId, fileId, viewer = null) {
  const file = await findFileOrThrow(workspaceId, fileId, viewer);
  if (!file.deletedAt) {
    throw AppError.badRequest('Move the file to Trash before deleting it for good', 'NOT_IN_TRASH');
  }

  // Its space was already given back when it went to Trash.
  const result = await StoredFile.deleteOne({ _id: fileId, workspaceId, deletedAt: { $ne: null } });
  if (result.deletedCount === 0) return;
  await deleteTranscriptsForFiles(workspaceId, [file._id]);
  await deleteInsightsForFiles(workspaceId, [file._id]);
  await removeFilesFromShares(workspaceId, [file._id]);
  await getStorageDriver()
    .delete(file.storageKey)
    .catch((err) =>
      logger.error({ err, fileId: String(fileId) }, 'Stored bytes could not be deleted'),
    );
}

// Deletes for good every file in one Trash: a project's, or the Drive's
// (projectId null). Files trashed from folders the viewer can't open are left
// alone. Their space was already given back when they went to Trash.
export async function emptyTrash(workspaceId, projectId = null, viewer = null) {
  const filter = { workspaceId, projectId, deletedAt: { $ne: null } };
  const hidden = await hiddenFolderIds(workspaceId, viewer);
  if (hidden.size > 0) filter.folderId = { $nin: [...hidden] };

  const files = await StoredFile.find(filter).select('storageKey size').lean();
  if (files.length === 0) return { count: 0, bytes: 0 };
  const ids = files.map((file) => file._id);
  // Only what was just read: a file restored in the meantime no longer matches.
  await StoredFile.deleteMany({ _id: { $in: ids }, workspaceId, deletedAt: { $ne: null } });
  await deleteTranscriptsForFiles(workspaceId, ids);
  await deleteInsightsForFiles(workspaceId, ids);
  await removeFilesFromShares(workspaceId, ids);

  const driver = getStorageDriver();
  await Promise.all(
    files.map((file) =>
      driver
        .delete(file.storageKey)
        .catch((err) =>
          logger.error({ err, fileId: String(file._id) }, 'Stored bytes could not be deleted'),
        ),
    ),
  );
  return { count: files.length, bytes: files.reduce((total, file) => total + file.size, 0) };
}

export async function createFileUrl(workspaceId, fileId, { disposition }, viewer = null) {
  const file = await findFileOrThrow(workspaceId, fileId, viewer);
  const mime = correctedMime(file.mime, file.extension);
  const inline = disposition === 'inline' && isPreviewable(mime, file.extension);
  const url = await getStorageDriver().createSignedUrl(file.storageKey, {
    fileName: file.displayName,
    mime: inline ? inlineMime(mime, file.extension) : mime,
    disposition: inline ? 'inline' : 'attachment',
    expiresInSeconds: storageConfig.signedUrlTtlSeconds,
  });
  const expiresAt = new Date(Date.now() + storageConfig.signedUrlTtlSeconds * 1000);
  return { url, expiresAt };
}

// Inline links for many files in one go (the grid view's thumbnails), instead
// of one request per file. Only previewable files get one; ids from another
// workspace are simply not found. Each link is identical to what createFileUrl
// gives for the same file in the same 5-minute window, so a thumbnail's bytes
// are already in the browser cache when the file is opened.
export async function createPreviewUrls(workspaceId, fileIds, viewer = null) {
  const [files, hidden] = await Promise.all([
    StoredFile.find({ _id: { $in: fileIds }, workspaceId })
      .select('storageKey displayName mime extension folderId')
      .lean(),
    hiddenFolderIds(workspaceId, viewer),
  ]);
  const driver = getStorageDriver();
  const shown = files.filter(
    (file) =>
      isPreviewable(correctedMime(file.mime, file.extension), file.extension) &&
      !hidden.has(String(file.folderId)),
  );
  const signed = await Promise.all(
    shown.map((file) =>
      driver.createSignedUrl(file.storageKey, {
        fileName: file.displayName,
        mime: inlineMime(correctedMime(file.mime, file.extension), file.extension),
        disposition: 'inline',
        expiresInSeconds: storageConfig.signedUrlTtlSeconds,
      }),
    ),
  );
  const urls = Object.fromEntries(shown.map((file, index) => [String(file._id), signed[index]]));
  const expiresAt = new Date(Date.now() + storageConfig.signedUrlTtlSeconds * 1000);
  return { urls, expiresAt };
}

// A deleted project disappears from every file that was linked to it.
export async function unlinkFilesFromProject(workspaceId, projectId) {
  await StoredFile.updateMany(
    { workspaceId, linkedProjectIds: projectId },
    { $pull: { linkedProjectIds: projectId } },
  );
}

// Removes every file matching `filter` for good (used when a project or a whole
// workspace is deleted): frees the space of files not already in Trash, drops
// the records, then deletes the stored bytes.
export async function purgeFiles(workspaceId, filter = {}) {
  const files = await StoredFile.find({ ...filter, workspaceId })
    .select('size storageKey deletedAt')
    .lean();
  if (files.length === 0) return { count: 0 };

  await StoredFile.deleteMany({ ...filter, workspaceId });
  const ids = files.map((file) => file._id);
  await deleteTranscriptsForFiles(workspaceId, ids);
  await deleteInsightsForFiles(workspaceId, ids);
  await removeFilesFromShares(workspaceId, ids);
  const liveBytes = files
    .filter((file) => !file.deletedAt)
    .reduce((total, file) => total + file.size, 0);
  await releaseStorage(workspaceId, liveBytes);

  const driver = getStorageDriver();
  await Promise.all(
    files.map((file) =>
      driver
        .delete(file.storageKey)
        .catch((err) =>
          logger.error({ err, fileId: String(file._id) }, 'Stored bytes could not be deleted'),
        ),
    ),
  );
  return { count: files.length };
}
