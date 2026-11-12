import { Event } from '../calendar/event.model.js';
import { Client } from '../clients/client.model.js';
import { StoredFile } from '../files/file.model.js';
import { Folder } from '../files/folder.model.js';
import { listActiveMembers } from '../members/members.service.js';
import { Project } from '../projects/project.model.js';
import { QuickNote } from '../quickNotes/quickNote.model.js';
import { visibleTo } from '../quickNotes/quickNotes.service.js';
import { Task } from '../tasks/task.model.js';

const OMITTED_FIELDS = '-__v -workspaceId';

// Records created or changed inside the range. No range means everything.
function rangeFilter(range) {
  if (!range) return {};
  const within = { $gte: range.from, $lte: range.to };
  return { $or: [{ createdAt: within }, { updatedAt: within }] };
}

function findIn(Model, workspaceId, filter) {
  return Model.find({ ...filter, workspaceId })
    .select(OMITTED_FIELDS)
    .lean();
}

function idsOf(records, field) {
  return [
    ...new Set(
      records
        .map((record) => record[field])
        .filter(Boolean)
        .map(String),
    ),
  ];
}

function missingIds(ids, present) {
  const have = new Set(present.map((record) => String(record._id)));
  return ids.filter((id) => !have.has(id));
}

// A dated backup still needs the parents of what it contains (a task's project,
// a file's folders), or a restore would have nothing to attach them to.
async function addMissingParents(workspaceId, data) {
  const neededProjects = missingIds(
    idsOf([...data.tasks, ...data.events, ...data.folders, ...data.files], 'projectId'),
    data.projects,
  );
  data.projects.push(...(await findIn(Project, workspaceId, { _id: { $in: neededProjects } })));

  const neededClients = missingIds(
    idsOf([...data.projects, ...data.events], 'clientId'),
    data.clients,
  );
  data.clients.push(...(await findIn(Client, workspaceId, { _id: { $in: neededClients } })));

  let neededFolders = missingIds(
    [...idsOf(data.folders, 'parentId'), ...idsOf(data.files, 'folderId')],
    data.folders,
  );
  while (neededFolders.length > 0) {
    const found = await findIn(Folder, workspaceId, { _id: { $in: neededFolders } });
    data.folders.push(...found);
    neededFolders = missingIds(idsOf(found, 'parentId'), data.folders);
  }
}

// Quick notes: the team's shared ones plus the downloader's own. Other people's
// private notes never leave the app.
function notesFilter(filter, userId) {
  return { $and: [filter, visibleTo(userId)] };
}

// storageKey is loaded for streaming the bytes, but never written into the zip.
export async function collectBackupData(workspaceId, range, userId) {
  const filter = rangeFilter(range);
  const [clients, projects, folders, tasks, events, files, notes, members] = await Promise.all([
    findIn(Client, workspaceId, filter),
    findIn(Project, workspaceId, filter),
    findIn(Folder, workspaceId, filter),
    findIn(Task, workspaceId, filter),
    findIn(Event, workspaceId, filter),
    StoredFile.find({ ...filter, workspaceId })
      .select('-__v -workspaceId')
      .lean(),
    findIn(QuickNote, workspaceId, notesFilter(filter, userId)),
    listActiveMembers(workspaceId),
  ]);

  const data = { clients, projects, folders, tasks, events, files, notes, members };
  if (range) await addMissingParents(workspaceId, data);
  return data;
}

export async function summarizeBackup(workspaceId, range, userId) {
  const filter = { ...rangeFilter(range), workspaceId };
  const models = {
    clients: Client,
    projects: Project,
    tasks: Task,
    events: Event,
    files: StoredFile,
  };
  const entries = await Promise.all(
    Object.entries(models).map(async ([name, Model]) => [name, await Model.countDocuments(filter)]),
  );
  entries.push([
    'notes',
    await QuickNote.countDocuments({ workspaceId, ...notesFilter(rangeFilter(range), userId) }),
  ]);
  const [bytes] = await StoredFile.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ]);
  return { counts: Object.fromEntries(entries), fileBytes: bytes?.total ?? 0 };
}
