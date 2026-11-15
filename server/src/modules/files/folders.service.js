import mongoose from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { withoutUndefined } from '../../utils/objects.js';
import { Membership } from '../members/membership.model.js';
import { VIEW_ROLES } from '../members/roles.js';
import { Project } from '../projects/project.model.js';
import { assertProjectExists } from '../projects/projects.service.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { StoredFile } from './file.model.js';
import { Folder } from './folder.model.js';
import {
  assertFolderAccess,
  hiddenFolderIds,
  locksByFolder,
  seesEveryFolder,
} from './folderAccess.js';

// What a new project starts with until the workspace sets its own list.
export const DEFAULT_FOLDERS = ['Raw', 'Working Files', 'Exports', 'References', 'Client Assets'];
export const MAX_PROJECT_FOLDERS = 20;
// Every project also gets this one, made just for meeting material (see FOLDER_KINDS).
export const BRIEFS_FOLDER_NAME = 'Notes & Briefs';
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
    kind: folder.kind ?? null,
    fileCount,
    access: folder.access ?? 'team',
    allowedUserIds: (folder.allowedUserIds ?? []).map(String),
    locked,
  };
}

function nameTaken() {
  return AppError.conflict('A folder with this name already exists here', 'FOLDER_NAME_TAKEN');
}

// The folders new projects in this workspace start with (without Notes & Briefs).
export async function projectFolderNames(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).select('projectFolders').lean();
  return workspace?.projectFolders ?? DEFAULT_FOLDERS;
}

async function insertIgnoringDuplicates(folders) {
  if (folders.length === 0) return;
  try {
    await Folder.insertMany(folders, { ordered: false });
  } catch (err) {
    if (err.code !== DUPLICATE_KEY) throw err;
  }
}

// A project's starting folders, made once: when it is created, or the first
// time its files are opened for projects made before this. A project that
// already has folders of its own is left as it is. Parallel calls are safe:
// the unique index rejects duplicates and those errors are ignored.
export async function ensureProjectFolders(workspaceId, projectId) {
  const project = await Project.findOne({ _id: projectId, workspaceId })
    .select('foldersSeeded')
    .lean();
  if (project && !project.foldersSeeded) {
    const hasOwn = await Folder.exists({ workspaceId, projectId, kind: null });
    if (!hasOwn) {
      const names = await projectFolderNames(workspaceId);
      await insertIgnoringDuplicates(
        names.map((name, position) => ({
          workspaceId,
          projectId,
          name,
          position,
          isDefault: true,
        })),
      );
    }
    await Project.updateOne({ _id: projectId, workspaceId }, { $set: { foldersSeeded: true } });
  }
  return ensureBriefsFolder(workspaceId, projectId);
}

// Created the first time anyone opens the Drive or a project's files.
async function ensureDefaultFolders(workspaceId, projectId = null) {
  if (projectId) {
    await ensureProjectFolders(workspaceId, projectId);
    return;
  }
  if (await Folder.exists({ workspaceId, projectId: null })) return;
  await insertIgnoringDuplicates(
    DEFAULT_DRIVE_FOLDERS.map((name, position) => ({
      workspaceId,
      projectId: null,
      name,
      position,
      isDefault: true,
    })),
  );
}

// Projects made before the briefs folder existed get it here. A folder the team
// already named "Notes & Briefs" is adopted rather than duplicated.
export async function ensureBriefsFolder(workspaceId, projectId) {
  const existing = await Folder.findOne({ workspaceId, projectId, kind: 'briefs' }).lean();
  if (existing) return existing;
  const filter = { workspaceId, projectId, parentId: null, name: BRIEFS_FOLDER_NAME };
  try {
    return (
      await Folder.create({ ...filter, position: -1, isDefault: true, kind: 'briefs' })
    ).toObject();
  } catch (err) {
    if (err.code !== DUPLICATE_KEY) throw err;
    const adopted = await Folder.findOneAndUpdate(
      { ...filter, kind: null },
      { $set: { kind: 'briefs' } },
      { new: true },
    ).lean();
    return adopted ?? Folder.findOne({ workspaceId, projectId, kind: 'briefs' }).lean();
  }
}

/**
 * The briefs folder a folder sits in (itself, or an ancestor), or null.
 * Walks up a few levels at most; folders are shallow.
 */
export async function briefsRootOf(workspaceId, folderId) {
  let currentId = folderId;
  const seen = new Set();
  while (currentId && !seen.has(String(currentId)) && seen.size < 20) {
    seen.add(String(currentId));
    const folder = await Folder.findOne({ _id: currentId, workspaceId })
      .select('parentId kind projectId name')
      .lean();
    if (!folder) return null;
    if (folder.kind === 'briefs') return folder;
    currentId = folder.parentId;
  }
  return null;
}

// The briefs folder and every folder inside it.
export async function briefsFolderTree(workspaceId, root) {
  const folders = await Folder.find({ workspaceId, projectId: root.projectId })
    .select('parentId')
    .lean();
  const ids = new Set([String(root._id)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(String(folder.parentId)) && !ids.has(String(folder._id))) {
        ids.add(String(folder._id));
        grew = true;
      }
    }
  }
  return [...ids];
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
  const doomed = await findFolderOrThrow(workspaceId, folderId);
  if (doomed.kind === 'briefs') {
    throw AppError.badRequest(
      "This folder feeds the project's AI brief, so it can be renamed but not deleted",
      'BRIEFS_FOLDER',
    );
  }
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
  // Never the briefs folder: a stray file there would end up in the AI brief.
  const folder = await Folder.findOne({ workspaceId, projectId, kind: null })
    .sort({ position: 1 })
    .select('_id')
    .lean();
  return folder._id;
}
