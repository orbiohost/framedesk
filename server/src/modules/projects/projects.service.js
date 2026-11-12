import { AppError } from '../../utils/AppError.js';
import { containsInsensitive, withoutUndefined } from '../../utils/objects.js';
import { assertClientExists } from '../clients/clients.service.js';
import { Event } from '../calendar/event.model.js';
import { Folder } from '../files/folder.model.js';
import { purgeFiles, unlinkFilesFromProject } from '../files/files.service.js';
import { unlinkProject as unlinkNotesFromProject } from '../quickNotes/quickNotes.service.js';
import { Task } from '../tasks/task.model.js';
import { Project } from './project.model.js';

// The match keeps populate inside the tenant (and satisfies the scope guard).
function clientPopulate(workspaceId) {
  return { path: 'clientId', select: 'name company', match: { workspaceId } };
}

export function toProjectDto(project, taskCounts) {
  const client = project.clientId;
  return {
    id: String(project._id),
    title: project.title,
    client: client ? { id: String(client._id), name: client.name, company: client.company } : null,
    type: project.type,
    status: project.status,
    priority: project.priority,
    startDate: project.startDate,
    dueDate: project.dueDate,
    budget: project.budget,
    description: project.description,
    tags: project.tags,
    tasks: { total: taskCounts?.total ?? 0, done: taskCounts?.done ?? 0 },
    // Whether a share link is live. The link itself comes from the share settings route.
    sharing: project.share?.enabled
      ? { audience: project.share.audience, permission: project.share.permission }
      : null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

async function countTasksByProject(workspaceId, projectIds) {
  const rows = await Task.aggregate([
    { $match: { workspaceId, projectId: { $in: projectIds } } },
    {
      $group: {
        _id: '$projectId',
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

export async function assertProjectExists(workspaceId, projectId) {
  const exists = await Project.exists({ _id: projectId, workspaceId });
  if (!exists) {
    throw AppError.badRequest('That project does not exist in this workspace', 'PROJECT_NOT_FOUND');
  }
}

function buildListFilter(workspaceId, { status, clientId, q }) {
  const filter = { workspaceId, status: status ?? { $ne: 'archived' } };
  if (clientId) filter.clientId = clientId;
  if (q) filter.title = containsInsensitive(q);
  return filter;
}

export async function listProjects(workspaceId, query) {
  const projects = await Project.find(buildListFilter(workspaceId, query))
    .sort({ updatedAt: -1 })
    .limit(500)
    .populate(clientPopulate(workspaceId))
    .lean();

  const counts = await countTasksByProject(
    workspaceId,
    projects.map((project) => project._id),
  );
  return projects.map((project) => toProjectDto(project, counts.get(String(project._id))));
}

export async function getProject(workspaceId, projectId) {
  const project = await Project.findOne({ _id: projectId, workspaceId })
    .populate(clientPopulate(workspaceId))
    .lean();
  if (!project) throw AppError.notFound('Project not found');

  const counts = await countTasksByProject(workspaceId, [project._id]);
  return toProjectDto(project, counts.get(String(project._id)));
}

export async function createProject(workspaceId, userId, input) {
  if (input.clientId) await assertClientExists(workspaceId, input.clientId);

  const project = await Project.create({
    ...withoutUndefined(input),
    workspaceId,
    createdBy: userId,
  });
  return getProject(workspaceId, project._id);
}

export async function updateProject(workspaceId, projectId, input) {
  if (input.clientId) await assertClientExists(workspaceId, input.clientId);

  const project = await Project.findOneAndUpdate(
    { _id: projectId, workspaceId },
    { $set: withoutUndefined(input) },
    { new: true, runValidators: true },
  ).lean();
  if (!project) throw AppError.notFound('Project not found');
  return getProject(workspaceId, project._id);
}

// Deletes the project with everything inside it: its files (bytes included,
// space given back), folders, tasks and calendar events. This cannot be undone.
export async function deleteProject(workspaceId, projectId) {
  const project = await Project.findOne({ _id: projectId, workspaceId }).lean();
  if (!project) throw AppError.notFound('Project not found');

  await purgeFiles(workspaceId, { projectId: project._id });
  await Promise.all([
    Folder.deleteMany({ workspaceId, projectId: project._id }),
    Task.deleteMany({ workspaceId, projectId: project._id }),
    Event.deleteMany({ workspaceId, projectId: project._id }),
    unlinkNotesFromProject(workspaceId, project._id),
    unlinkFilesFromProject(workspaceId, project._id),
  ]);
  await Project.deleteOne({ _id: project._id, workspaceId });
}
