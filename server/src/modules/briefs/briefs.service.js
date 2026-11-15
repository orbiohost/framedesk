import { AppError } from '../../utils/AppError.js';
import { getAiSettings, isAiLive } from '../ai/aiSettings.service.js';
import { StoredFile } from '../files/file.model.js';
import { assertFolderAccess } from '../files/folderAccess.js';
import { briefsFolderTree, ensureBriefsFolder } from '../files/folders.service.js';
import { assertProjectExists } from '../projects/projects.service.js';
import { createNote } from '../quickNotes/quickNotes.service.js';
import { createTask } from '../tasks/tasks.service.js';
import { BRIEF_DEBOUNCE_MS } from './briefWorker.js';
import { ProjectBrief } from './projectBrief.model.js';

const NOTE_BODY_MAX = 10_000;
const ANALYSABLE = ['video', 'audio', 'image', 'document'];

function ids(list) {
  return (list ?? []).map(String);
}

function toPoint(point) {
  return { text: point.text, fileIds: ids(point.fileIds) };
}

function toBriefDto(brief, { folder, files, progress, aiEnabled }) {
  const created = new Set(ids(brief?.tasksCreatedFor));
  return {
    projectId: String(folder.projectId),
    folder: { id: String(folder._id), name: folder.name },
    aiEnabled,
    status: brief?.status ?? (files.length ? 'queued' : 'empty'),
    error: brief?.error ?? null,
    progress,
    generatedAt: brief?.generatedAt ?? null,
    title: brief?.title ?? '',
    overview: brief?.overview ?? '',
    keyPoints: (brief?.keyPoints ?? []).map(toPoint),
    decisions: (brief?.decisions ?? []).map(toPoint),
    openQuestions: (brief?.openQuestions ?? []).map(toPoint),
    actionItems: (brief?.actionItems ?? []).map((item) => ({
      id: String(item._id),
      text: item.text,
      owner: item.owner,
      due: item.due,
      fileIds: ids(item.fileIds),
      taskCreated: created.has(String(item._id)),
    })),
    meetings: (brief?.meetings ?? []).map((meeting) => ({
      title: meeting.title,
      date: meeting.date,
      attendees: meeting.attendees,
      summary: meeting.summary,
      decisions: meeting.decisions,
      fileIds: ids(meeting.fileIds),
    })),
    notes: brief?.notes ?? '',
    // For citations: the files in the folder now (deleted ones drop out).
    files: files.map((file) => ({
      id: String(file._id),
      name: file.displayName,
      category: file.category,
      extension: file.extension,
      folderId: String(file.folderId),
    })),
    // Whether the brief was written from exactly what is there now.
    upToDate: sameIds(brief?.sourceFileIds, files),
  };
}

function sameIds(sourceIds, files) {
  const a = ids(sourceIds).sort();
  const b = files.map((file) => String(file._id)).sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

async function briefsFolderFor(workspaceId, projectId, viewer) {
  await assertProjectExists(workspaceId, projectId);
  const folder = await ensureBriefsFolder(workspaceId, projectId);
  await assertFolderAccess(workspaceId, folder._id, viewer);
  return folder;
}

function progressOf(files) {
  const readable = files.filter((file) => ANALYSABLE.includes(file.category));
  return {
    total: files.length,
    read: readable.filter((file) => file.aiState === 'done').length,
    reading: readable.filter((file) => [null, 'processing'].includes(file.aiState)).length,
    unreadable: files.filter(
      (file) => !ANALYSABLE.includes(file.category) || ['skipped', 'failed'].includes(file.aiState),
    ).length,
  };
}

async function queue(workspaceId, projectId, folderId, { force = false } = {}) {
  await ProjectBrief.updateOne(
    { workspaceId, projectId },
    {
      $set: {
        folderId,
        status: 'queued',
        // Due straight away rather than after the usual wait.
        staleSince: new Date(Date.now() - BRIEF_DEBOUNCE_MS),
        attempts: 0,
        retryAt: null,
        error: null,
        ...(force && { signature: null }),
      },
    },
    { upsert: true },
  );
}

export async function getBrief(workspaceId, projectId, viewer) {
  const folder = await briefsFolderFor(workspaceId, projectId, viewer);
  const folderIds = await briefsFolderTree(workspaceId, folder);
  const [files, settings] = await Promise.all([
    StoredFile.find({ workspaceId, folderId: { $in: folderIds }, deletedAt: null })
      .select('displayName category extension folderId aiState createdAt')
      .sort({ createdAt: 1 })
      .lean(),
    getAiSettings(),
  ]);
  let brief = await ProjectBrief.findOne({ workspaceId, projectId }).lean();
  const aiEnabled = isAiLive(settings);

  // Files that were there before this feature, or changes nobody reported:
  // if the brief doesn't match the folder and nothing is queued, queue it.
  const settled = !brief || (!brief.staleSince && ['ready', 'empty'].includes(brief.status));
  if (aiEnabled && settled && !sameIds(brief?.sourceFileIds, files)) {
    if (files.length > 0 || brief) {
      await queue(workspaceId, projectId, folder._id);
      brief = await ProjectBrief.findOne({ workspaceId, projectId }).lean();
    }
  }
  return toBriefDto(brief, { folder, files, progress: progressOf(files), aiEnabled });
}

export async function regenerateBrief(workspaceId, projectId, viewer) {
  const folder = await briefsFolderFor(workspaceId, projectId, viewer);
  const current = await ProjectBrief.findOne({ workspaceId, projectId }).select('status').lean();
  if (current?.status === 'generating') {
    throw AppError.conflict('The brief is being written right now', 'BRIEF_BUSY');
  }
  await queue(workspaceId, projectId, folder._id, { force: true });
  return getBrief(workspaceId, projectId, viewer);
}

async function readyBrief(workspaceId, projectId, viewer) {
  await briefsFolderFor(workspaceId, projectId, viewer);
  const brief = await ProjectBrief.findOne({ workspaceId, projectId }).lean();
  if (!brief?.generatedAt) throw AppError.badRequest('There is no brief yet', 'NO_BRIEF');
  return brief;
}

function list(heading, items) {
  if (!items?.length) return '';
  return `## ${heading}\n${items.map((item) => `- ${item}`).join('\n')}\n`;
}

// The brief as one Markdown note, without file citations (notes can't open files).
function asMarkdown(brief) {
  const strip = (value) => String(value ?? '').replace(/\s*\[\[file:[a-f\d]{24}\]\]/g, '');
  const actions = brief.actionItems.map((item) => {
    const extra = [item.owner, item.due && `due ${item.due}`].filter(Boolean).join(', ');
    return `[ ] ${item.text}${extra ? ` (${extra})` : ''}`;
  });
  return [
    brief.overview,
    list(
      'Key points',
      brief.keyPoints.map((point) => point.text),
    ),
    list(
      'Decisions',
      brief.decisions.map((point) => point.text),
    ),
    list('Action items', actions),
    list(
      'Open questions',
      brief.openQuestions.map((point) => point.text),
    ),
    brief.notes ? `---\n${strip(brief.notes)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function saveBriefAsNote(workspaceId, userId, projectId, viewer) {
  const brief = await readyBrief(workspaceId, projectId, viewer);
  let body = asMarkdown(brief);
  if (body.length > NOTE_BODY_MAX) body = `${body.slice(0, NOTE_BODY_MAX - 1)}…`;
  return createNote(workspaceId, userId, {
    title: (brief.title || 'Project brief').slice(0, 160),
    body,
    projectIds: [projectId],
    visibility: 'workspace',
  });
}

// "2026-11-20" -> a date; anything vaguer ("next week") stays in the description.
function dueDateOf(due) {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return undefined;
  const date = new Date(`${due}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Turns action items into project tasks. itemIds: which ones (all not yet
 * turned into tasks when left out). Each item becomes a task only once.
 */
export async function createTasksFromBrief(workspaceId, userId, projectId, itemIds, viewer) {
  const brief = await readyBrief(workspaceId, projectId, viewer);
  const done = new Set(ids(brief.tasksCreatedFor));
  const wanted = itemIds ? new Set(itemIds.map(String)) : null;
  const items = brief.actionItems.filter(
    (item) => !done.has(String(item._id)) && (!wanted || wanted.has(String(item._id))),
  );
  const created = [];
  for (const item of items) {
    const details = [
      item.owner && `Owner (from the notes): ${item.owner}`,
      item.due && `Due (from the notes): ${item.due}`,
      `From the project brief "${brief.title || 'Notes & Briefs'}".`,
    ].filter(Boolean);
    const task = await createTask(workspaceId, userId, {
      projectId,
      title: item.text.slice(0, 300),
      description: details.join('\n'),
      dueDate: dueDateOf(item.due),
    });
    created.push(task);
    await ProjectBrief.updateOne(
      { _id: brief._id, workspaceId },
      { $addToSet: { tasksCreatedFor: item._id } },
    );
  }
  return created;
}

export async function deleteBriefForProject(workspaceId, projectId) {
  await ProjectBrief.deleteMany({ workspaceId, projectId });
}
