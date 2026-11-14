import { escapeRegex } from '../../utils/objects.js';
import { Event } from '../calendar/event.model.js';
import { Client } from '../clients/client.model.js';
import { StoredFile } from '../files/file.model.js';
import { toFileDto } from '../files/files.service.js';
import { Folder } from '../files/folder.model.js';
import { hiddenFolderIds } from '../files/folderAccess.js';
import { Project } from '../projects/project.model.js';
import { QuickNote } from '../quickNotes/quickNote.model.js';
import { visibleTo } from '../quickNotes/quickNotes.service.js';
import { Task } from '../tasks/task.model.js';

// The header search: one call that looks through everything a member can see
// in the workspace, grouped by kind. Matches are ranked so "edit" finds
// "Edit v2" before "Final credits".

const LIMIT = 6; // per group shown
const FILE_LIMIT = 30; // files are split again by category on the client
const FETCH = 40; // candidates fetched per kind before ranking

// 0 = exact, 1 = starts with, 2 = a word starts with, 3 = contains anywhere.
function rank(texts, needle) {
  let best = 9;
  for (const raw of texts) {
    if (!raw) continue;
    const text = String(raw).toLowerCase();
    if (text === needle) return 0;
    if (text.startsWith(needle)) best = Math.min(best, 1);
    else if (new RegExp(`(^|[\\s_\\-.#/(])${escapeRegex(needle)}`).test(text))
      best = Math.min(best, 2);
    else if (text.includes(needle)) best = Math.min(best, 3);
  }
  return best;
}

function ranked(rows, needle, textsOf, limit) {
  return rows
    .map((row, index) => ({ row, score: rank(textsOf(row), needle), index }))
    .filter((entry) => entry.score < 9)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.row);
}

const id = (value) => (value ? String(value) : null);

function scopedPopulate(workspaceId) {
  // Every model here is tenant-guarded, so populated lookups name the workspace too.
  return (path, select) => ({ path, select, match: { workspaceId } });
}

export async function searchWorkspace(workspaceId, viewer, query) {
  const scoped = scopedPopulate(workspaceId);
  const needle = query.trim().toLowerCase();
  const re = { $regex: escapeRegex(needle), $options: 'i' };
  const hidden = [...(await hiddenFolderIds(workspaceId, viewer))];
  const visibleFolder = hidden.length ? { $nin: hidden } : { $exists: true };

  // Projects also match on their client's name ("acme" finds Acme's projects).
  const matchingClients = await Client.find({
    workspaceId,
    $or: [{ name: re }, { company: re }, { email: re }],
  })
    .sort({ archivedAt: 1, updatedAt: -1 })
    .limit(FETCH)
    .lean();
  const clientIds = matchingClients.map((client) => client._id);

  const [projects, tasks, files, folders, notes, events] = await Promise.all([
    Project.find({
      workspaceId,
      $or: [
        { title: re },
        { tags: re },
        ...(clientIds.length ? [{ clientId: { $in: clientIds } }] : []),
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(FETCH)
      .populate(scoped('clientId', 'name'))
      .lean(),
    Task.find({ workspaceId, $or: [{ title: re }, { 'checklist.text': re }] })
      .sort({ updatedAt: -1 })
      .limit(FETCH)
      .populate(scoped('projectId', 'title'))
      .lean(),
    StoredFile.find({
      workspaceId,
      deletedAt: null,
      folderId: visibleFolder,
      $or: [{ displayName: re }, { tags: re }, { note: re }],
    })
      .sort({ _id: -1 })
      .limit(FETCH * 2)
      .populate('uploadedBy', 'name')
      .populate({ path: 'linkedProjectIds', select: 'title', match: { workspaceId } })
      .populate(scoped('projectId', 'title'))
      .lean(),
    Folder.find({
      workspaceId,
      name: re,
      ...(hidden.length ? { _id: { $nin: hidden } } : {}),
    })
      .limit(FETCH)
      .populate(scoped('projectId', 'title'))
      .lean(),
    QuickNote.find({
      workspaceId,
      $and: [visibleTo(viewer.userId), { $or: [{ title: re }, { body: re }, { tags: re }] }],
    })
      .sort({ updatedAt: -1 })
      .limit(FETCH)
      .lean(),
    Event.find({ workspaceId, $or: [{ title: re }, { location: re }] })
      .sort({ startsAt: -1 })
      .limit(FETCH)
      .populate(scoped('projectId', 'title'))
      .lean(),
  ]);

  return {
    projects: ranked(
      projects,
      needle,
      (p) => [p.title, p.clientId?.name, ...(p.tags ?? [])],
      LIMIT,
    ).map((p) => ({
      id: id(p._id),
      title: p.title,
      status: p.status,
      client: p.clientId?.name ?? null,
    })),
    clients: ranked(matchingClients, needle, (c) => [c.name, c.company, c.email], LIMIT).map(
      (c) => ({
        id: id(c._id),
        name: c.name,
        company: c.company ?? null,
        archived: Boolean(c.archivedAt),
      }),
    ),
    tasks: ranked(
      tasks,
      needle,
      (t) => [t.title, ...(t.checklist ?? []).map((i) => i.text)],
      LIMIT,
    ).map((t) => ({
      id: id(t._id),
      title: t.title,
      status: t.status,
      project: t.projectId ? { id: id(t.projectId._id), title: t.projectId.title } : null,
    })),
    files: ranked(files, needle, (f) => [f.displayName, ...(f.tags ?? []), f.note], FILE_LIMIT).map(
      (f) => {
        const project = f.projectId?._id
          ? { id: id(f.projectId._id), title: f.projectId.title }
          : null;
        return { ...toFileDto({ ...f, projectId: project?.id ?? null }), project };
      },
    ),
    folders: ranked(folders, needle, (f) => [f.name], LIMIT).map((f) => ({
      id: id(f._id),
      name: f.name,
      project: f.projectId?._id ? { id: id(f.projectId._id), title: f.projectId.title } : null,
    })),
    notes: ranked(notes, needle, (n) => [n.title, ...(n.tags ?? []), n.body], LIMIT).map((n) => ({
      id: id(n._id),
      title: n.title || n.body.split('\n')[0].slice(0, 80),
      excerpt: n.title ? n.body.slice(0, 100) : null,
      shared: n.visibility === 'workspace',
    })),
    events: ranked(events, needle, (e) => [e.title, e.location], LIMIT).map((e) => ({
      id: id(e._id),
      title: e.title,
      startsAt: e.startsAt,
      allDay: e.allDay,
      project: e.projectId?._id ? { id: id(e.projectId._id), title: e.projectId.title } : null,
    })),
  };
}
