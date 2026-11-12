import { AppError } from '../../utils/AppError.js';
import { randomToken } from '../../utils/crypto.js';
import { withoutUndefined } from '../../utils/objects.js';
import { getCalendarFeed } from '../calendar/calendar.service.js';
import { StoredFile } from '../files/file.model.js';
import { createFileUrl, createPreviewUrls, listFiles } from '../files/files.service.js';
import { listFolders } from '../files/folders.service.js';
import { Project } from '../projects/project.model.js';
import { getProject } from '../projects/projects.service.js';
import { QuickNote } from '../quickNotes/quickNote.model.js';
import { toNoteDto } from '../quickNotes/quickNotes.service.js';
import { Task } from '../tasks/task.model.js';
import { createTask, listTasks, updateTask } from '../tasks/tasks.service.js';
import { Workspace } from '../workspaces/workspace.model.js';

// Visitors of a share link see what a plain team viewer sees: folders limited
// to specific people stay hidden. The id matches no real user.
const SHARE_VIEWER = Object.freeze({ userId: 'share-link', role: 'viewer' });

const DUPLICATE_KEY = 11000;

// ---------------------------------------------------------------------------
// Managing the link (workspace managers, from inside the app)

function toShareSettingsDto(share) {
  return {
    enabled: Boolean(share?.enabled),
    token: share?.token ?? null,
    audience: share?.audience ?? 'anyone',
    permission: share?.permission ?? 'view',
    updatedAt: share?.updatedAt ?? null,
  };
}

async function findProjectOrThrow(workspaceId, projectId) {
  const project = await Project.findOne({ _id: projectId, workspaceId }).select('share').lean();
  if (!project) throw AppError.notFound('Project not found');
  return project;
}

export async function getShareSettings(workspaceId, projectId) {
  const project = await findProjectOrThrow(workspaceId, projectId);
  return toShareSettingsDto(project.share);
}

// Sets a fresh token. A clash with another project's token is astronomically
// unlikely, but the unique index would reject it, so retry once.
async function writeShare(workspaceId, projectId, set) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const project = await Project.findOneAndUpdate(
        { _id: projectId, workspaceId },
        { $set: set(randomToken(24)) },
        { new: true, runValidators: true },
      )
        .select('share')
        .lean();
      if (!project) throw AppError.notFound('Project not found');
      return toShareSettingsDto(project.share);
    } catch (err) {
      if (err.code !== DUPLICATE_KEY || attempt > 0) throw err;
    }
  }
}

export async function updateShareSettings(workspaceId, projectId, userId, input) {
  const current = await findProjectOrThrow(workspaceId, projectId);
  const changes = withoutUndefined(input);
  return writeShare(workspaceId, projectId, (freshToken) => {
    const set = { 'share.updatedBy': userId, 'share.updatedAt': new Date() };
    for (const [key, value] of Object.entries(changes)) set[`share.${key}`] = value;
    // The first time a project is shared it gets its link.
    if (!current.share?.token) set['share.token'] = freshToken;
    return set;
  });
}

// A new link: whoever had the old one loses access.
export async function resetShareLink(workspaceId, projectId, userId) {
  await findProjectOrThrow(workspaceId, projectId);
  return writeShare(workspaceId, projectId, (freshToken) => ({
    'share.token': freshToken,
    'share.updatedBy': userId,
    'share.updatedAt': new Date(),
  }));
}

// ---------------------------------------------------------------------------
// Using the link (anyone holding it; req.user may be null)

function shareNotFound() {
  return AppError.notFound(
    'This share link does not exist or has been turned off',
    'SHARE_NOT_FOUND',
  );
}

// Everything below starts here: finds the shared project and checks the visitor
// may open it. Returns { workspaceId, projectId, permission, project }.
export async function resolveShare(token, user) {
  const project = await Project.findOne({ 'share.token': token, 'share.enabled': true })
    .setOptions({ crossWorkspace: true })
    .select('workspaceId share createdBy')
    .lean();
  if (!project) throw shareNotFound();
  if (!(await Workspace.exists({ _id: project.workspaceId }))) throw shareNotFound();

  if (project.share.audience === 'signed_in' && !user) {
    throw AppError.unauthorized('Sign in to open this project', 'SIGN_IN_REQUIRED');
  }
  return {
    workspaceId: project.workspaceId,
    projectId: project._id,
    permission: project.share.permission,
    audience: project.share.audience,
    // Tasks added by visitors who aren't signed in are recorded as created by
    // the person who set up the link.
    fallbackUserId: project.share.updatedBy ?? project.createdBy,
  };
}

function assertCanEdit(share) {
  if (share.permission !== 'edit') {
    throw AppError.forbidden('This link only allows viewing', 'SHARE_READ_ONLY');
  }
}

export async function getSharedProject(share, user) {
  const [project, workspace] = await Promise.all([
    getProject(share.workspaceId, share.projectId),
    Workspace.findById(share.workspaceId).select('name').lean(),
  ]);
  // The budget is the studio's business, not the visitor's.
  const { budget: _budget, ...visible } = project;
  return {
    project: visible,
    workspace: { name: workspace?.name ?? '' },
    access: {
      permission: share.permission,
      audience: share.audience,
      viewer: user ? { name: user.name } : null,
    },
  };
}

// Visitors see names on tasks but nothing that leads back to member accounts.
function publicTask(task) {
  return {
    ...task,
    project: null,
    assignee: task.assignee ? { id: null, name: task.assignee.name } : null,
  };
}

export async function listSharedTasks(share) {
  const tasks = await listTasks(share.workspaceId, { projectId: share.projectId });
  return tasks.map(publicTask);
}

export async function createSharedTask(share, user, input) {
  assertCanEdit(share);
  const task = await createTask(share.workspaceId, user?._id ?? share.fallbackUserId, {
    ...input,
    projectId: share.projectId,
  });
  return publicTask(task);
}

export async function updateSharedTask(share, taskId, input) {
  assertCanEdit(share);
  const inProject = await Task.exists({
    _id: taskId,
    workspaceId: share.workspaceId,
    projectId: share.projectId,
  });
  if (!inProject) throw AppError.notFound('Task not found');
  return publicTask(await updateTask(share.workspaceId, taskId, input));
}

function publicFile(file) {
  const { linkedProjectIds: _ids, linkedProjects: _projects, ...rest } = file;
  return { ...rest, uploadedBy: file.uploadedBy ? { id: null, name: file.uploadedBy.name } : null };
}

export async function listSharedFiles(share, { cursor }) {
  const [folders, page] = await Promise.all([
    cursor ? null : listFolders(share.workspaceId, share.projectId, SHARE_VIEWER),
    listFiles(share.workspaceId, { projectId: share.projectId, cursor }, SHARE_VIEWER),
  ]);
  return {
    folders: folders?.map((folder) => ({
      id: folder.id,
      parentId: folder.parentId,
      name: folder.name,
      fileCount: folder.fileCount,
    })),
    files: page.files.map(publicFile),
    nextCursor: page.nextCursor,
  };
}

// Only live files of the shared project; anything else looks missing.
async function liveProjectFileIds(share, fileIds) {
  const files = await StoredFile.find({
    _id: { $in: fileIds },
    workspaceId: share.workspaceId,
    projectId: share.projectId,
    deletedAt: null,
  })
    .select('_id')
    .lean();
  return files.map((file) => file._id);
}

export async function createSharedFileUrl(share, fileId, { disposition }) {
  const [found] = await liveProjectFileIds(share, [fileId]);
  if (!found) throw AppError.notFound('File not found', 'FILE_NOT_FOUND');
  return createFileUrl(share.workspaceId, found, { disposition }, SHARE_VIEWER);
}

export async function createSharedPreviewUrls(share, fileIds) {
  const ids = await liveProjectFileIds(share, fileIds);
  return createPreviewUrls(share.workspaceId, ids, SHARE_VIEWER);
}

export async function getSharedCalendar(share, { from, to }) {
  const items = await getCalendarFeed(share.workspaceId, {
    from,
    to,
    projectId: share.projectId,
  });
  return items.map(({ assigneeIds: _assignees, clientId: _client, ...item }) => item);
}

// Only notes the team shared with the whole workspace; private notes stay private.
export async function listSharedNotes(share) {
  const notes = await QuickNote.find({
    workspaceId: share.workspaceId,
    projectIds: share.projectId,
    visibility: 'workspace',
  })
    .sort({ pinned: -1, updatedAt: -1 })
    .limit(200)
    .populate({ path: 'createdBy', select: 'name' })
    .lean();
  return notes.map((note) => {
    const { isMine: _mine, projects: _projects, author, ...dto } = toNoteDto(note, null);
    return { ...dto, author: author ? { id: null, name: author.name } : null };
  });
}
