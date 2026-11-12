import mongoose from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { withoutUndefined } from '../../utils/objects.js';
import { Membership } from '../members/membership.model.js';
import { VIEW_ROLES } from '../members/roles.js';
import { assertProjectExists } from '../projects/projects.service.js';
import { StoredFile } from './file.model.js';
import { Folder } from './folder.model.js';
import {
  assertFolderAccess,
  hiddenFolderIds,
  locksByFolder,
  seesEveryFolder,
} from './folderAccess.js';

export const DEFAULT_FOLDERS = ['Raw', 'Working Files', 'Exports', 'References', 'Client Assets'];
// The workspace Drive (projectId null) holds files that belong to no project.
export const DEFAULT_DRIVE_FOLDERS = ['Documents', 'Media', 'Templates', 'Shared'];

const DUPLICATE_KEY = 11000;

// locked: this folder, or one it sits inside, is limited to specific people.
function toFolderDto(folder, fileCount = 0, locked = folder.access === 'restricted') {
  return {
    id: String(folder._id),
    projectId: folder.projectId ? String(folder.projectId) : null,
    parentId: folder.parentId ? String(folder.parentId) : null,
    name: folder.name,
    isDefault: folder.isDefault,
    fileCount,
    access: folder.access ?? 'team',
    allowedUserIds: (folder.allowedUserIds ?? []).map(String),
    locked,
  };
}

function nameTaken() {
  return AppError.conflict('A folder with this name already exists here', 'FOLDER_NAME_TAKEN');
}

// Created the first time anyone opens a project's files, which covers projects
// made before the file manager existed. Parallel calls are safe: the unique
// index rejects duplicates and those errors are ignored.
async function ensureDefaultFolders(workspaceId, projectId = null) {
  if (await Folder.exists({ workspaceId, projectId })) return;

  const names = projectId ? DEFAULT_FOLDERS : DEFAULT_DRIVE_FOLDERS;
  const defaults = names.map((name, position) => ({
    workspaceId,
    projectId,
    name,
    position,
    isDefault: true,
  }));
  try {
    await Folder.insertMany(defaults, { ordered: false });
  } catch (err) {
    if (err.code !== DUPLICATE_KEY) throw err;
  }
}

async function countLiveFilesByFolder(workspaceId, projectId) {
  const rows = await StoredFile.aggregate([
    {
      $match: {
        workspaceId,
        projectId: projectId ? new mongoose.Types.ObjectId(projectId) : null,
        deletedAt: null,
      },
    },
    { $group: { _id: '$folderId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

// A top-level Drive folder with this name, created on first use (e.g. the
// "Transcriptions" folder). Safe to call in parallel: a duplicate insert loses
// the race and the winner's folder is returned.
export async function ensureDriveFolder(workspaceId, name, userId = null) {
  const filter = { workspaceId, projectId: null, parentId: null, name };
  const existing = await Folder.findOne(filter).lean();
  if (existing) return toFolderDto(existing);
  await ensureDefaultFolders(workspaceId, null);
  try {
    const folder = await Folder.create({ ...filter, position: Date.now(), createdBy: userId });
    return toFolderDto(folder);
  } catch (err) {
    if (err.code !== DUPLICATE_KEY) throw err;
    return toFolderDto(await Folder.findOne(filter).lean());
  }
}

export async function findFolderOrThrow(workspaceId, folderId) {
  const folder = await Folder.findOne({ _id: folderId, workspaceId }).lean();
  if (!folder) throw AppError.notFound('Folder not found', 'FOLDER_NOT_FOUND');
  return folder;
}

// Without a projectId this lists the workspace Drive. Folders the viewer isn't
// allowed into are left out, along with everything inside them.
export async function listFolders(workspaceId, projectId = null, viewer = null) {
  if (projectId) await assertProjectExists(workspaceId, projectId);
  await ensureDefaultFolders(workspaceId, projectId);

  const [folders, counts, hidden] = await Promise.all([
    Folder.find({ workspaceId, projectId }).sort({ position: 1, name: 1 }).lean(),
    countLiveFilesByFolder(workspaceId, projectId),
    hiddenFolderIds(workspaceId, viewer),
  ]);
  const locks = locksByFolder(folders);
  return folders
    .filter((folder) => !hidden.has(String(folder._id)))
    .map((folder) =>
      toFolderDto(folder, counts.get(String(folder._id)), locks.has(String(folder._id))),
    );
}

async function assertParentInProject(workspaceId, projectId, parentId) {
  if (!parentId) return;
  const parent = await findFolderOrThrow(workspaceId, parentId);
  if (String(parent.projectId ?? null) !== String(projectId ?? null)) {
    throw AppError.badRequest('The parent folder belongs to another project', 'WRONG_PROJECT');
  }
}

export async function createFolder(
  workspaceId,
  userId,
  { projectId = null, parentId, name },
  viewer = null,
) {
  if (projectId) await assertProjectExists(workspaceId, projectId);
  await assertParentInProject(workspaceId, projectId, parentId);
  if (parentId) await assertFolderAccess(workspaceId, parentId, viewer);
  try {
    const folder = await Folder.create({
      workspaceId,
      projectId: projectId ?? null,
      parentId: parentId ?? null,
      name,
      position: Date.now(),
      createdBy: userId,
    });
    return toFolderDto(folder, 0, await isLocked(workspaceId, folder));
  } catch (err) {
    if (err.code === DUPLICATE_KEY) throw nameTaken();
    throw err;
  }
}

// Walks up from the new parent; finding the folder itself means a cycle.
async function assertNotMovingIntoItself(workspaceId, folderId, newParentId) {
  let currentId = newParentId;
  while (currentId) {
    if (String(currentId) === String(folderId)) {
      throw AppError.badRequest("A folder can't be moved inside itself", 'FOLDER_CYCLE');
    }
    const current = await Folder.findOne({ _id: currentId, workspaceId }).select('parentId').lean();
    currentId = current?.parentId;
  }
}

export async function updateFolder(workspaceId, folderId, { name, parentId }, viewer = null) {
  const folder = await findFolderOrThrow(workspaceId, folderId);
  await assertFolderAccess(workspaceId, folderId, viewer);
  if (parentId !== undefined) {
    await assertParentInProject(workspaceId, folder.projectId, parentId);
    if (parentId) await assertFolderAccess(workspaceId, parentId, viewer);
    await assertNotMovingIntoItself(workspaceId, folderId, parentId);
  }

  try {
    const updated = await Folder.findOneAndUpdate(
      { _id: folderId, workspaceId },
      { $set: withoutUndefined({ name, parentId }) },
      { new: true, runValidators: true },
    ).lean();
    return toFolderDto(updated, 0, await isLocked(workspaceId, updated));
  } catch (err) {
    if (err.code === DUPLICATE_KEY) throw nameTaken();
    throw err;
  }
}

// Only empty folders can go; files must be moved or trashed first.
export async function deleteFolder(workspaceId, folderId, viewer = null) {
  await findFolderOrThrow(workspaceId, folderId);
  await assertFolderAccess(workspaceId, folderId, viewer);
  const [hasChildren, hasFiles] = await Promise.all([
    Folder.exists({ workspaceId, parentId: folderId }),
    StoredFile.exists({ workspaceId, folderId, deletedAt: null }),
  ]);
  if (hasChildren || hasFiles) {
    throw AppError.conflict('Move or delete what is inside this folder first', 'FOLDER_NOT_EMPTY');
  }
  await Folder.deleteOne({ _id: folderId, workspaceId });
}

// True when the folder, or any folder it sits inside, is restricted.
async function isLocked(workspaceId, folder) {
  let current = folder;
  const seen = new Set();
  while (current && !seen.has(String(current._id))) {
    if (current.access === 'restricted') return true;
    seen.add(String(current._id));
    current = current.parentId
      ? await Folder.findOne({ _id: current.parentId, workspaceId })
          .select('parentId access')
          .lean()
      : null;
  }
  return false;
}

// Who may open a folder: the whole team, or only the people listed. Whoever
// sets a restriction stays on the list, so they can't lock themselves out;
// owners and admins get in regardless and are not stored.
export async function setFolderAccess(workspaceId, folderId, { access, userIds }, viewer) {
  await findFolderOrThrow(workspaceId, folderId);
  await assertFolderAccess(workspaceId, folderId, viewer);

  let allowedUserIds = [];
  if (access === 'restricted') {
    const wanted = new Set(userIds);
    if (!seesEveryFolder(viewer)) wanted.add(viewer.userId);
    const members = await Membership.find({
      workspaceId,
      userId: { $in: [...wanted] },
      status: 'active',
      role: { $in: VIEW_ROLES },
    })
      .select('userId')
      .lean();
    if (members.length !== wanted.size) {
      throw AppError.badRequest(
        "Only people on this workspace's team can be given access",
        'NOT_A_MEMBER',
      );
    }
    allowedUserIds = members.map((member) => member.userId);
  }

  const updated = await Folder.findOneAndUpdate(
    { _id: folderId, workspaceId },
    { $set: { access, allowedUserIds } },
    { new: true, runValidators: true },
  ).lean();
  return toFolderDto(updated, 0, await isLocked(workspaceId, updated));
}

// Where a restored file goes if its folder has since been deleted.
export async function fallbackFolderId(workspaceId, projectId = null) {
  await ensureDefaultFolders(workspaceId, projectId);
  const folder = await Folder.findOne({ workspaceId, projectId })
    .sort({ position: 1 })
    .select('_id')
    .lean();
  return folder._id;
}
