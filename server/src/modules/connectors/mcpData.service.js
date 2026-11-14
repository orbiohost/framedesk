import mongoose from 'mongoose';
import { escapeRegex } from '../../utils/objects.js';
import { AiInsight } from '../ai/aiInsight.model.js';
import { Event } from '../calendar/event.model.js';
import { Client } from '../clients/client.model.js';
import { StoredFile } from '../files/file.model.js';
import { hiddenFolderIds } from '../files/folderAccess.js';
import { Folder } from '../files/folder.model.js';
import { Project } from '../projects/project.model.js';
import { QuickNote } from '../quickNotes/quickNote.model.js';
import { Task } from '../tasks/task.model.js';
import { Transcript } from '../transcripts/transcript.model.js';
import { User } from '../users/user.model.js';
import { PUBLIC_ORIGIN, shareableWorkspaces } from './oauth.service.js';

// Everything an AI connector can read. Read-only on purpose: each function
// takes the connection context ({ user, grant }) and only ever returns what
// that person could see in the app, inside the workspaces the connection
// covers. Membership and roles are checked fresh on every call, so removing
// someone from a workspace cuts their assistant off too.

// A problem the assistant should see and can fix (bad id, missing argument).
export class ToolError extends Error {}

const DAY_MS = 24 * 3600 * 1000;
const { ObjectId } = mongoose.Types;

const iso = (date) => (date ? new Date(date).toISOString() : null);

function objectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw new ToolError(`${label} is not a valid id`);
  return new ObjectId(String(value));
}

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ToolError(`${label} must be a date like 2026-03-01 or 2026-03-01T10:00:00Z`);
  }
  return date;
}

function textMatch(query, fields) {
  const pattern = { $regex: escapeRegex(query.trim().slice(0, 200)), $options: 'i' };
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

function truncate(text, max) {
  if (!text) return text ?? null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const appUrl = (path) => `${PUBLIC_ORIGIN}${path}`;

// ---------------------------------------------------------------------------
// Which workspaces

export async function accessibleWorkspaces({ user, grant }) {
  const all = await shareableWorkspaces(user._id);
  if (grant.allWorkspaces) return all;
  const allowed = new Set(grant.workspaceIds.map(String));
  return all.filter((workspace) => allowed.has(workspace.id));
}

// Most people have one workspace, so workspace_id is optional when there's only one.
async function resolveWorkspace(ctx, workspaceId) {
  const workspaces = await accessibleWorkspaces(ctx);
  if (workspaces.length === 0) {
    throw new ToolError('This connection has no workspaces it can read.');
  }
  let workspace;
  if (workspaceId) {
    workspace = workspaces.find((item) => item.id === String(workspaceId));
    if (!workspace) {
      throw new ToolError(
        'Workspace not found, or not shared with this connection. Call list_workspaces for valid ids.',
      );
    }
  } else if (workspaces.length === 1) {
    [workspace] = workspaces;
  } else {
    const options = workspaces.map((item) => `${item.name} (${item.id})`).join(', ');
    throw new ToolError(`Several workspaces are available; pass workspace_id. Options: ${options}`);
  }
  return {
    ...workspace,
    _id: new ObjectId(workspace.id),
    viewer: { userId: String(ctx.user._id), role: workspace.role },
  };
}

async function namesById(userIds) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (ids.length === 0) return new Map();
  const users = await User.find({ _id: { $in: ids } })
    .select('name')
    .lean();
  return new Map(users.map((user) => [String(user._id), user.name]));
}

async function projectTitles(workspaceId, projectIds) {
  const ids = [...new Set(projectIds.filter(Boolean).map(String))];
  if (ids.length === 0) return new Map();
  const projects = await Project.find({ workspaceId, _id: { $in: ids } })
    .select('title')
    .lean();
  return new Map(projects.map((project) => [String(project._id), project.title]));
}

async function clientNames(workspaceId, clientIds) {
  const ids = [...new Set(clientIds.filter(Boolean).map(String))];
  if (ids.length === 0) return new Map();
  const clients = await Client.find({ workspaceId, _id: { $in: ids } })
    .select('name company')
    .lean();
  return new Map(clients.map((client) => [String(client._id), client.name]));
}

async function visibleFileFilter(workspace) {
  const hidden = await hiddenFolderIds(workspace._id, workspace.viewer);
  const filter = { workspaceId: workspace._id, deletedAt: null };
  if (hidden.size > 0) {
    filter.folderId = { $nin: [...hidden].map((id) => new ObjectId(id)) };
  }
  return filter;
}

function visibleNoteFilter(workspace, userId) {
  return {
    workspaceId: workspace._id,
    $or: [{ visibility: 'workspace' }, { createdBy: userId }],
  };
}

const countBy = (rows) => Object.fromEntries(rows.map((row) => [row._id ?? 'none', row.count]));

// ---------------------------------------------------------------------------
// Shapes

function taskShape(task, { names, projects }) {
  const checklistDone = task.checklist?.filter((item) => item.done).length ?? 0;
  return {
    id: String(task._id),
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: iso(task.dueDate),
    completedAt: iso(task.completedAt),
    project: task.projectId
      ? { id: String(task.projectId), title: projects.get(String(task.projectId)) ?? null }
      : null,
    assignee: task.assigneeId ? (names.get(String(task.assigneeId)) ?? 'Unknown') : null,
    checklist: task.checklist?.length ? `${checklistDone}/${task.checklist.length} done` : null,
    description: truncate(task.description, 1500),
    updatedAt: iso(task.updatedAt),
  };
}

function eventShape(event, { projects, clients }) {
  return {
    id: String(event._id),
    title: event.title,
    type: event.type,
    startsAt: iso(event.startsAt),
    endsAt: iso(event.endsAt),
    allDay: event.allDay,
    location: event.location,
    project: event.projectId
      ? { id: String(event.projectId), title: projects.get(String(event.projectId)) ?? null }
      : null,
    client: event.clientId ? (clients.get(String(event.clientId)) ?? null) : null,
    notes: truncate(event.notes, 1000),
  };
}

function fileShape(file, { insights, projects, transcripts }) {
  const insight = insights?.get(String(file._id));
  return {
    id: String(file._id),
    name: file.displayName,
    category: file.category,
    mime: file.mime,
    sizeBytes: file.size,
    status: file.status,
    version: file.version,
    tags: file.tags,
    note: file.note || null,
    project: file.projectId
      ? { id: String(file.projectId), title: projects?.get(String(file.projectId)) ?? null }
      : null,
    aiSummary: insight?.summary || null,
    transcript: transcripts?.get(String(file._id)) ?? null,
    uploadedAt: iso(file.createdAt),
  };
}

function noteShape(note, { names, projects }) {
  return {
    id: String(note._id),
    title: note.title,
    body: truncate(note.body, 4000),
    tags: note.tags,
    pinned: note.pinned,
    visibility: note.visibility,
    author: names.get(String(note.createdBy)) ?? null,
    projects: note.projectIds.map((id) => ({
      id: String(id),
      title: projects.get(String(id)) ?? null,
    })),
    updatedAt: iso(note.updatedAt),
  };
}

async function decorateTasks(workspaceId, tasks) {
  const [names, projects] = await Promise.all([
    namesById(tasks.map((task) => task.assigneeId)),
    projectTitles(
      workspaceId,
      tasks.map((task) => task.projectId),
    ),
  ]);
  return tasks.map((task) => taskShape(task, { names, projects }));
}

async function decorateEvents(workspaceId, events) {
  const [projects, clients] = await Promise.all([
    projectTitles(
      workspaceId,
      events.map((event) => event.projectId),
    ),
    clientNames(
      workspaceId,
      events.map((event) => event.clientId),
    ),
  ]);
  return events.map((event) => eventShape(event, { projects, clients }));
}

async function decorateFiles(workspaceId, files) {
  const fileIds = files.map((file) => file._id);
  const [insights, transcripts, projects] = await Promise.all([
    AiInsight.find({ workspaceId, fileId: { $in: fileIds } })
      .select('fileId summary')
      .lean(),
    Transcript.find({ workspaceId, fileId: { $in: fileIds } })
      .select('fileId status')
      .lean(),
    projectTitles(
      workspaceId,
      files.map((file) => file.projectId),
    ),
  ]);
  return files.map((file) =>
    fileShape(file, {
      insights: new Map(insights.map((item) => [String(item.fileId), item])),
      transcripts: new Map(transcripts.map((item) => [String(item.fileId), item.status])),
      projects,
    }),
  );
}

async function decorateNotes(workspaceId, notes) {
  const [names, projects] = await Promise.all([
    namesById(notes.map((note) => note.createdBy)),
    projectTitles(
      workspaceId,
      notes.flatMap((note) => note.projectIds),
    ),
  ]);
  return notes.map((note) => noteShape(note, { names, projects }));
}

// ---------------------------------------------------------------------------
// Tools

export async function listWorkspaces(ctx) {
  const workspaces = await accessibleWorkspaces(ctx);
  return {
    user: { name: ctx.user.name },
    workspaces: workspaces.map((workspace) => ({
      ...workspace,
      url: appUrl(`/w/${workspace.id}`),
    })),
  };
}

export async function workspaceOverview(ctx, { workspace_id: workspaceId }) {
  const workspace = await resolveWorkspace(ctx, workspaceId);
  const workspaceFilter = { workspaceId: workspace._id };
  const now = new Date();
  const openTasks = { ...workspaceFilter, status: { $ne: 'done' } };
  const fileFilter = await visibleFileFilter(workspace);

  const [
    projectsByStatus,
    tasksByStatus,
    overdueCount,
    overdue,
    dueThisWeek,
    upcomingEvents,
    clientCount,
    fileStats,
    recentProjects,
  ] = await Promise.all([
    Project.aggregate([
      { $match: workspaceFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: workspaceFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.countDocuments({ ...openTasks, dueDate: { $lt: now } }),
    Task.find({ ...openTasks, dueDate: { $lt: now } })
      .sort({ dueDate: 1 })
      .limit(10)
      .lean(),
    Task.find({ ...openTasks, dueDate: { $gte: now, $lt: new Date(now.getTime() + 7 * DAY_MS) } })
      .sort({ dueDate: 1 })
      .limit(15)
      .lean(),
    Event.find({
      ...workspaceFilter,
      endsAt: { $gte: now },
      startsAt: { $lt: new Date(now.getTime() + 14 * DAY_MS) },
    })
      .sort({ startsAt: 1 })
      .limit(15)
      .lean(),
    Client.countDocuments({ ...workspaceFilter, archivedAt: null }),
    StoredFile.aggregate([
      { $match: fileFilter },
      { $group: { _id: '$category', count: { $sum: 1 }, bytes: { $sum: '$size' } } },
    ]),
    Project.find({ ...workspaceFilter, status: { $ne: 'archived' } })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('title status dueDate updatedAt')
      .lean(),
  ]);

  return {
    workspace: { id: workspace.id, name: workspace.name, yourRole: workspace.role },
    generatedAt: iso(now),
    projects: {
      byStatus: countBy(projectsByStatus),
      recentlyUpdated: recentProjects.map((project) => ({
        id: String(project._id),
        title: project.title,
        status: project.status,
        dueDate: iso(project.dueDate),
        updatedAt: iso(project.updatedAt),
      })),
    },
    tasks: {
      byStatus: countBy(tasksByStatus),
      overdueCount,
      overdue: await decorateTasks(workspace._id, overdue),
      dueInNext7Days: await decorateTasks(workspace._id, dueThisWeek),
    },
    calendar: { next14Days: await decorateEvents(workspace._id, upcomingEvents) },
    clients: { active: clientCount },
    files: {
      byCategory: Object.fromEntries(
        fileStats.map((row) => [row._id, { count: row.count, bytes: row.bytes }]),
      ),
    },
  };
}

export async function listProjects(ctx, args) {
  const workspace = await resolveWorkspace(ctx, args.workspace_id);
  const filter = { workspaceId: workspace._id };
  if (args.status) filter.status = args.status;
  else if (!args.include_archived) filter.status = { $ne: 'archived' };
  if (args.client_id) filter.clientId = objectId(args.client_id, 'client_id');
  if (args.query) Object.assign(filter, textMatch(args.query, ['title', 'description', 'tags']));

  const projects = await Project.find(filter)
    .sort({ updatedAt: -1 })
    .limit(args.limit ?? 50)
    .lean();
  const ids = projects.map((project) => project._id);
  const [taskCounts, clients] = await Promise.all([
    Task.aggregate([
      { $match: { workspaceId: workspace._id, projectId: { $in: ids } } },
      { $group: { _id: { project: '$projectId', status: '$status' }, count: { $sum: 1 } } },
    ]),
    clientNames(
      workspace._id,
      projects.map((project) => project.clientId),
    ),
  ]);
  const tasksFor = new Map();
  for (const row of taskCounts) {
    const key = String(row._id.project);
    tasksFor.set(key, { ...tasksFor.get(key), [row._id.status]: row.count });
  }

  return {
    workspace: { id: workspace.id, name: workspace.name },
    count: projects.length,
    projects: projects.map((project) => ({
      id: String(project._id),
      title: project.title,
      status: project.status,
      type: project.type,
      priority: project.priority,
      client: project.clientId
        ? { id: String(project.clientId), name: clients.get(String(project.clientId)) ?? null }
        : null,
      startDate: iso(project.startDate),
      dueDate: iso(project.dueDate),
      budget: project.budget,
      tags: project.tags,
      tasks: tasksFor.get(String(project._id)) ?? {},
      updatedAt: iso(project.updatedAt),
      url: appUrl(`/w/${workspace.id}/projects/${project._id}`),
    })),
  };
}

export async function getProject(ctx, args) {
  const workspace = await resolveWorkspace(ctx, args.workspace_id);
  const projectId = objectId(args.project_id, 'project_id');
  const project = await Project.findOne({ workspaceId: workspace._id, _id: projectId }).lean();
  if (!project) throw new ToolError('Project not found');

  const fileFilter = await visibleFileFilter(workspace);
  const [client, tasks, events, files, fileCount, notes, creator] = await Promise.all([
    project.clientId
      ? Client.findOne({ workspaceId: workspace._id, _id: project.clientId })
          .select('name company email')
          .lean()
      : null,
    Task.find({ workspaceId: workspace._id, projectId })
      .sort({ status: 1, order: 1 })
      .limit(300)
      .lean(),
    Event.find({ workspaceId: workspace._id, projectId }).sort({ startsAt: -1 }).limit(30).lean(),
    StoredFile.find({ ...fileFilter, $or: [{ projectId }, { linkedProjectIds: projectId }] })
      .sort({ _id: -1 })
      .limit(30)
      .lean(),
    StoredFile.countDocuments({
      ...fileFilter,
      $or: [{ projectId }, { linkedProjectIds: projectId }],
    }),
    QuickNote.find({ ...visibleNoteFilter(workspace, ctx.user._id), projectIds: projectId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean(),
    User.findById(project.createdBy).select('name').lean(),
  ]);

  return {
    project: {
      id: String(project._id),
      title: project.title,
      status: project.status,
      type: project.type,
      priority: project.priority,
      startDate: iso(project.startDate),
      dueDate: iso(project.dueDate),
      budget: project.budget,
      budgetCurrency: project.budget === null || project.budget === undefined ? null : 'INR',
      tags: project.tags,
      description: truncate(project.description, 8000),
      createdBy: creator?.name ?? null,
      createdAt: iso(project.createdAt),
      updatedAt: iso(project.updatedAt),
      url: appUrl(`/w/${workspace.id}/projects/${project._id}`),
    },
    client: client
      ? { id: String(client._id), name: client.name, company: client.company, email: client.email }
      : null,
    tasks: await decorateTasks(workspace._id, tasks),
    events: await decorateEvents(workspace._id, events),
    files: { total: fileCount, latest: await decorateFiles(workspace._id, files) },
    notes: await decorateNotes(workspace._id, notes),
  };
}

export async function listTasks(ctx, args) {
  const workspace = await resolveWorkspace(ctx, args.workspace_id);
  const filter = { workspaceId: workspace._id };
  if (args.project_id) filter.projectId = objectId(args.project_id, 'project_id');
  if (args.status) filter.status = args.status;
  if (args.priority) filter.priority = args.priority;
  if (args.assigned_to_me) filter.assigneeId = ctx.user._id;

  const dueFrom = parseDate(args.due_from, 'due_from');
  const dueTo = parseDate(args.due_to, 'due_to');
  if (args.overdue_only) {
    filter.status = { $ne: 'done' };
    filter.dueDate = { $lt: new Date() };
  } else if (dueFrom || dueTo) {
    filter.dueDate = {};
    if (dueFrom) filter.dueDate.$gte = dueFrom;
    if (dueTo) filter.dueDate.$lte = dueTo;
  }
  if (args.query) Object.assign(filter, textMatch(args.query, ['title', 'description']));

  const limit = args.limit ?? 100;
  const [tasks, total] = await Promise.all([
    Task.find(filter).sort({ dueDate: 1, updatedAt: -1 }).limit(limit).lean(),
    Task.countDocuments(filter),
  ]);
  return {
    workspace: { id: workspace.id, name: workspace.name },
    total,
    returned: tasks.length,
    tasks: await decorateTasks(workspace._id, tasks),
  };
}

export async function listClients(ctx, args) {
  const workspace = await resolveWorkspace(ctx, args.workspace_id);
  const filter = { workspaceId: workspace._id };
  if (!args.include_archived) filter.archivedAt = null;
  if (args.query)
    Object.assign(filter, textMatch(args.query, ['name', 'company', 'email', 'tags']));

  const clients = await Client.find(filter)
    .sort({ name: 1 })
    .limit(args.limit ?? 100)
    .lean();
  const projectCounts = await Project.aggregate([
    { $match: { workspaceId: workspace._id, clientId: { $in: clients.map((c) => c._id) } } },
    { $group: { _id: '$clientId', count: { $sum: 1 } } },
  ]);
  const counts = new Map(projectCounts.map((row) => [String(row._id), row.count]));

  return {
    workspace: { id: workspace.id, name: workspace.name },
    count: clients.length,
    clients: clients.map((client) => ({
      id: String(client._id),
      name: client.name,
      company: client.company,
      email: client.email,
      phone: client.phone,
      tags: client.tags,
      archived: Boolean(client.archivedAt),
      projects: counts.get(String(client._id)) ?? 0,
      notes: truncate(client.notes, 500),
      url: appUrl(`/w/${workspace.id}/clients/${client._id}`),
    })),
  };
}

export async function getClient(ctx, args) {
  const workspace = await resolveWorkspace(ctx, args.workspace_id);
  const clientId = objectId(args.client_id, 'client_id');
  const client = await Client.findOne({ workspaceId: workspace._id, _id: clientId }).lean();
  if (!client) throw new ToolError('Client not found');

  const [projects, events] = await Promise.all([
    Project.find({ workspaceId: workspace._id, clientId })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean(),
    Event.find({ workspaceId: workspace._id, clientId }).sort({ startsAt: -1 }).limit(30).lean(),
  ]);

  return {
    client: {
      id: String(client._id),
      name: client.name,
      company: client.company,
      email: client.email,
      phone: client.phone,
      tags: client.tags,
      notes: truncate(client.notes, 5000),
      archived: Boolean(client.archivedAt),
      createdAt: iso(client.createdAt),
      url: appUrl(`/w/${workspace.id}/clients/${client._id}`),
    },
    projects: projects.map((project) => ({
      id: String(project._id),
      title: project.title,
      status: project.status,
      dueDate: iso(project.dueDate),
      budget: project.budget,
    })),
    events: await decorateEvents(workspace._id, events),
  };
}

export async function listEvents(ctx, args) {
  const workspace = await resolveWorkspace(ctx, args.workspace_id);
  const from = parseDate(args.from, 'from') ?? new Date();
  const to = parseDate(args.to, 'to') ?? new Date(from.getTime() + 30 * DAY_MS);
  if (to <= from) throw new ToolError('"to" must be after "from"');
  if (to - from > 366 * DAY_MS) throw new ToolError('Ask for at most one year at a time');

  const filter = { workspaceId: workspace._id, endsAt: { $gte: from }, startsAt: { $lte: to } };
  if (args.project_id) filter.projectId = objectId(args.project_id, 'project_id');
  if (args.type) filter.type = args.type;

  const events = await Event.find(filter)
    .sort({ startsAt: 1 })
    .limit(args.limit ?? 200)
    .lean();
  return {
    workspace: { id: workspace.id, name: workspace.name },
    range: { from: iso(from), to: iso(to) },
    count: events.length,
    events: await decorateEvents(workspace._id, events),
  };
}

export async function listFiles(ctx, args) {
  const workspace = await resolveWorkspace(ctx, args.workspace_id);
  const filter = await visibleFileFilter(workspace);
  const and = [];
  if (args.project_id) {
    const projectId = objectId(args.project_id, 'project_id');
    and.push({ $or: [{ projectId }, { linkedProjectIds: projectId }] });
  } else if (args.drive_only) {
    filter.projectId = null;
  }
  if (args.category) filter.category = args.category;
  if (args.status) filter.status = args.status;
  if (args.query) and.push(textMatch(args.query, ['displayName', 'tags', 'note']));
  if (and.length > 0) filter.$and = and;

  const [files, total] = await Promise.all([
    StoredFile.find(filter)
      .sort({ _id: -1 })
      .limit(args.limit ?? 50)
      .lean(),
    StoredFile.countDocuments(filter),
  ]);
  return {
    workspace: { id: workspace.id, name: workspace.name },
    total,
    returned: files.length,
    files: await decorateFiles(workspace._id, files),
  };
}

async function findVisibleFile(workspace, fileIdValue) {
  const fileId = objectId(fileIdValue, 'file_id');
  const filter = await visibleFileFilter(workspace);
  const file = await StoredFile.findOne({ ...filter, _id: fileId }).lean();
  if (!file) throw new ToolError('File not found');
  return file;
}

function fileUrl(workspace, file) {
  return appUrl(
    file.projectId
      ? `/w/${workspace.id}/projects/${file.projectId}/files`
      : `/w/${workspace.id}/drive`,
  );
}

function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function transcriptText(transcript, { timestamps, maxChars }) {
  const lines = transcript.segments.map((segment) =>
    timestamps ? `[${formatTimestamp(segment.start)}] ${segment.text.trim()}` : segment.text.trim(),
  );
  const text = lines.join(timestamps ? '\n' : ' ');
  return { text: text.slice(0, maxChars), truncated: text.length > maxChars, length: text.length };
}

export async function getFile(ctx, args) {
  const workspace = await resolveWorkspace(ctx, args.workspace_id);
  const file = await findVisibleFile(workspace, args.file_id);
  const [folder, project, insight, transcript, uploader] = await Promise.all([
    Folder.findOne({ workspaceId: workspace._id, _id: file.folderId }).select('name').lean(),
    file.projectId
      ? Project.findOne({ workspaceId: workspace._id, _id: file.projectId }).select('title').lean()
      : null,
    AiInsight.findOne({ workspaceId: workspace._id, fileId: file._id }).lean(),
    Transcript.findOne({ workspaceId: workspace._id, fileId: file._id })
      .select('status detectedLanguage durationSec segments')
      .lean(),
    User.findById(file.uploadedBy).select('name').lean(),
  ]);

  return {
    file: {
      id: String(file._id),
      name: file.displayName,
      extension: file.extension,
      category: file.category,
      mime: file.mime,
      sizeBytes: file.size,
      status: file.status,
      version: file.version,
      tags: file.tags,
      note: file.note || null,
      folder: folder?.name ?? null,
      project: project ? { id: String(project._id), title: project.title } : null,
      uploadedBy: uploader?.name ?? null,
      uploadedAt: iso(file.createdAt),
      url: fileUrl(workspace, file),
    },
    aiAnalysis: insight
      ? {
          summary: insight.summary || null,
          details: insight.details || null,
          tags: insight.tags,
          keyMoments: insight.moments,
          language: insight.language,
          basedOn: insight.source,
        }
      : null,
    transcript: transcript
      ? {
          status: transcript.status,
          language: transcript.detectedLanguage,
          durationSec: transcript.durationSec,
          segments: transcript.segments.length,
          hint: 'Call get_transcript for the full text.',
        }
      : null,
  };
}

export async function getTranscript(ctx, args) {
  const workspace = await resolveWorkspace(ctx, args.workspace_id);
  const file = await findVisibleFile(workspace, args.file_id);
  const transcript = await Transcript.findOne({ workspaceId: workspace._id, fileId: file._id })
    .select('status detectedLanguage durationSec segments task error')
    .lean();
  if (!transcript) throw new ToolError('This file has no transcript. It can be made in the app.');

  const body = transcriptText(transcript, {
    timestamps: Boolean(args.include_timestamps),
    maxChars: args.max_chars ?? 60_000,
  });
  return {
    file: { id: String(file._id), name: file.displayName },
    status: transcript.status,
    language: transcript.detectedLanguage,
    translatedToEnglish: transcript.task === 'translate',
    durationSec: transcript.durationSec,
    ...body,
  };
}

export async function listNotes(ctx, args) {
  const workspace = await resolveWorkspace(ctx, args.workspace_id);
  const filter = visibleNoteFilter(workspace, ctx.user._id);
  const and = [];
  if (args.project_id) filter.projectIds = objectId(args.project_id, 'project_id');
  if (args.tag) filter.tags = args.tag.replace(/^#/, '').toLowerCase();
  if (args.query) and.push(textMatch(args.query, ['title', 'body']));
  if (and.length > 0) filter.$and = and;

  const notes = await QuickNote.find(filter)
    .sort({ pinned: -1, updatedAt: -1 })
    .limit(args.limit ?? 50)
    .lean();
  return {
    workspace: { id: workspace.id, name: workspace.name },
    count: notes.length,
    notes: await decorateNotes(workspace._id, notes),
  };
}

// ---------------------------------------------------------------------------
// search + fetch: the pair ChatGPT (deep research, company knowledge) expects.
// Result ids are "<kind>:<workspaceId>:<recordId>".

const SEARCH_PER_KIND = 8;
const SEARCH_MAX_WORKSPACES = 10;

async function searchWorkspace(workspace, userId, query) {
  const wid = workspace.id;
  const fileFilter = await visibleFileFilter(workspace);
  const scoped = { workspaceId: workspace._id };
  const [projects, tasks, clients, files, notes, events] = await Promise.all([
    Project.find({ ...scoped, ...textMatch(query, ['title', 'description', 'tags']) })
      .sort({ updatedAt: -1 })
      .limit(SEARCH_PER_KIND)
      .select('title status')
      .lean(),
    Task.find({ ...scoped, ...textMatch(query, ['title', 'description']) })
      .sort({ updatedAt: -1 })
      .limit(SEARCH_PER_KIND)
      .select('title status projectId')
      .lean(),
    Client.find({ ...scoped, ...textMatch(query, ['name', 'company', 'email', 'notes']) })
      .limit(SEARCH_PER_KIND)
      .select('name company')
      .lean(),
    StoredFile.find({ ...fileFilter, $and: [textMatch(query, ['displayName', 'tags', 'note'])] })
      .sort({ _id: -1 })
      .limit(SEARCH_PER_KIND)
      .select('displayName projectId category')
      .lean(),
    QuickNote.find({
      ...visibleNoteFilter(workspace, userId),
      $and: [textMatch(query, ['title', 'body', 'tags'])],
    })
      .sort({ updatedAt: -1 })
      .limit(SEARCH_PER_KIND)
      .select('title body')
      .lean(),
    Event.find({ ...scoped, ...textMatch(query, ['title', 'notes', 'location']) })
      .sort({ startsAt: -1 })
      .limit(SEARCH_PER_KIND)
      .select('title startsAt')
      .lean(),
  ]);

  const result = (kind, record, title, path) => ({
    id: `${kind}:${wid}:${record._id}`,
    title: `${title} (${kind}, ${workspace.name})`,
    url: appUrl(path),
  });
  return [
    ...projects.map((p) => result('project', p, p.title, `/w/${wid}/projects/${p._id}`)),
    ...tasks.map((t) =>
      result(
        'task',
        t,
        t.title,
        t.projectId ? `/w/${wid}/projects/${t.projectId}/tasks` : `/w/${wid}/tasks`,
      ),
    ),
    ...clients.map((c) =>
      result(
        'client',
        c,
        c.company ? `${c.name} — ${c.company}` : c.name,
        `/w/${wid}/clients/${c._id}`,
      ),
    ),
    ...files.map((f) =>
      result(
        'file',
        f,
        f.displayName,
        f.projectId ? `/w/${wid}/projects/${f.projectId}/files` : `/w/${wid}/drive`,
      ),
    ),
    ...notes.map((n) => result('note', n, n.title || truncate(n.body, 60), `/w/${wid}/notes`)),
    ...events.map((e) => result('event', e, e.title, `/w/${wid}/calendar`)),
  ];
}

export async function search(ctx, { query }) {
  if (!query?.trim()) return { results: [] };
  const workspaces = (await accessibleWorkspaces(ctx)).slice(0, SEARCH_MAX_WORKSPACES);
  const perWorkspace = await Promise.all(
    workspaces.map((workspace) =>
      searchWorkspace(
        {
          ...workspace,
          _id: new ObjectId(workspace.id),
          viewer: { userId: String(ctx.user._id), role: workspace.role },
        },
        ctx.user._id,
        query,
      ),
    ),
  );
  return { results: perWorkspace.flat().slice(0, 50) };
}

async function fetchTask(ctx, workspaceId, id) {
  const workspace = await resolveWorkspace(ctx, workspaceId);
  const task = await Task.findOne({ workspaceId: workspace._id, _id: objectId(id, 'id') }).lean();
  if (!task) throw new ToolError('Task not found');
  const [shaped] = await decorateTasks(workspace._id, [task]);
  return {
    ...shaped,
    checklistItems: task.checklist.map((item) => ({ text: item.text, done: item.done })),
    description: task.description,
  };
}

async function fetchEvent(ctx, workspaceId, id) {
  const workspace = await resolveWorkspace(ctx, workspaceId);
  const event = await Event.findOne({ workspaceId: workspace._id, _id: objectId(id, 'id') }).lean();
  if (!event) throw new ToolError('Event not found');
  const [shaped] = await decorateEvents(workspace._id, [event]);
  return { ...shaped, notes: event.notes };
}

async function fetchNote(ctx, workspaceId, id) {
  const workspace = await resolveWorkspace(ctx, workspaceId);
  const note = await QuickNote.findOne({
    ...visibleNoteFilter(workspace, ctx.user._id),
    _id: objectId(id, 'id'),
  }).lean();
  if (!note) throw new ToolError('Note not found');
  const [shaped] = await decorateNotes(workspace._id, [note]);
  return { ...shaped, body: note.body };
}

async function fetchFile(ctx, workspaceId, id) {
  const details = await getFile(ctx, { workspace_id: workspaceId, file_id: id });
  if (details.transcript?.status === 'done') {
    const transcript = await getTranscript(ctx, {
      workspace_id: workspaceId,
      file_id: id,
      max_chars: 40_000,
    });
    details.transcript = { ...details.transcript, hint: undefined, text: transcript.text };
  }
  return details;
}

const FETCHERS = {
  project: (ctx, workspaceId, id) => getProject(ctx, { workspace_id: workspaceId, project_id: id }),
  client: (ctx, workspaceId, id) => getClient(ctx, { workspace_id: workspaceId, client_id: id }),
  task: fetchTask,
  event: fetchEvent,
  note: fetchNote,
  file: fetchFile,
};

function titleOf(kind, data) {
  return (
    data.project?.title ??
    data.client?.name ??
    data.file?.name ??
    data.title ??
    (kind === 'note' ? 'Note' : kind)
  );
}

function urlOf(data) {
  return data.project?.url ?? data.client?.url ?? data.file?.url ?? null;
}

export async function fetchRecord(ctx, { id }) {
  const [kind, workspaceId, recordId] = String(id ?? '').split(':');
  const fetcher = FETCHERS[kind];
  if (!fetcher || !workspaceId || !recordId) {
    throw new ToolError('id must be one returned by search, like "project:<workspace>:<id>"');
  }
  const data = await fetcher(ctx, workspaceId, recordId);
  return {
    id,
    title: titleOf(kind, data),
    text: JSON.stringify(data, null, 2),
    url: urlOf(data) ?? appUrl(`/w/${workspaceId}`),
    metadata: { kind, workspaceId },
  };
}
