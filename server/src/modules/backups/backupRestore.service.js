import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storageConfig } from '../../config/storage.js';
import { AppError } from '../../utils/AppError.js';
import { AuditLog } from '../admin/auditLog.model.js';
import { Event } from '../calendar/event.model.js';
import { Client } from '../clients/client.model.js';
import { StoredFile } from '../files/file.model.js';
import { ingestFile } from '../files/fileIngest.js';
import { categoryFor } from '../files/fileTypes.js';
import { Folder } from '../files/folder.model.js';
import { fallbackFolderId } from '../files/folders.service.js';
import { Membership } from '../members/membership.model.js';
import { Project } from '../projects/project.model.js';
import { QuickNote } from '../quickNotes/quickNote.model.js';
import { Task } from '../tasks/task.model.js';
import { MANIFEST_PATH, RESTORABLE_COLLECTIONS, dataPath, manifestSchema } from './backupFormat.js';
import { addProblem, existsHere, newCollectionResult, restoreRecords } from './restoreRecords.js';
import { openBackupZip } from './zipReader.js';

const TIMESTAMPS = ['createdAt', 'updatedAt', 'createdBy'];

const FIELDS = {
  clients: ['name', 'company', 'email', 'phone', 'notes', 'tags', 'archivedAt', ...TIMESTAMPS],
  projects: [
    'title',
    'clientId',
    'type',
    'status',
    'priority',
    'startDate',
    'dueDate',
    'budget',
    'description',
    'tags',
    ...TIMESTAMPS,
  ],
  folders: [
    'projectId',
    'parentId',
    'name',
    'isDefault',
    'position',
    'access',
    'allowedUserIds',
    ...TIMESTAMPS,
  ],
  tasks: [
    'projectId',
    'title',
    'description',
    'assigneeId',
    'dueDate',
    'status',
    'priority',
    'checklist',
    'order',
    'completedAt',
    ...TIMESTAMPS,
  ],
  events: [
    'title',
    'type',
    'startsAt',
    'endsAt',
    'allDay',
    'projectId',
    'clientId',
    'assigneeIds',
    'location',
    'notes',
    ...TIMESTAMPS,
  ],
  files: [
    'projectId',
    'folderId',
    'displayName',
    'extension',
    'version',
    'status',
    'tags',
    'linkedProjectIds',
    'note',
    'uploadedBy',
    'deletedAt',
    'deletedBy',
    'createdAt',
    'updatedAt',
  ],
  notes: ['title', 'body', 'projectIds', 'tags', 'pinned', 'visibility', ...TIMESTAMPS],
};

async function readManifest(zip, workspaceId) {
  const parsed = manifestSchema.safeParse(await zip.readJson(MANIFEST_PATH));
  if (!parsed.success) {
    throw AppError.badRequest('This zip is not a FrameDesk backup', 'INVALID_BACKUP');
  }
  if (parsed.data.workspace.id !== String(workspaceId)) {
    throw AppError.badRequest(
      `This backup is from "${parsed.data.workspace.name}". Backups can only be restored into the workspace they came from.`,
      'BACKUP_FROM_OTHER_WORKSPACE',
    );
  }
  return parsed.data;
}

async function activeMemberIds(workspaceId) {
  const memberships = await Membership.find({ workspaceId, status: 'active' })
    .select('userId')
    .lean();
  return new Set(memberships.map((membership) => String(membership.userId)));
}

async function idOrNull(Model, workspaceId, id) {
  return (await existsHere(Model, workspaceId, id)) ? id : null;
}

function restoreClients(ctx, records) {
  return restoreRecords({
    Model: Client,
    records,
    fields: FIELDS.clients,
    label: 'clients',
    ctx,
    prepare: (doc) => doc,
  });
}

function restoreProjects(ctx, records) {
  return restoreRecords({
    Model: Project,
    records,
    fields: FIELDS.projects,
    label: 'projects',
    ctx,
    prepare: async (doc) => ({
      ...doc,
      clientId: await idOrNull(Client, ctx.workspaceId, doc.clientId),
    }),
  });
}

// Parents first: each pass restores the folders whose parent now exists.
async function restoreFolders(ctx, records) {
  let pending = Array.isArray(records) ? records : [];
  for (let depth = 0; depth < 20 && pending.length > 0; depth += 1) {
    const ready = [];
    const waiting = [];
    for (const record of pending) {
      const parentReady =
        !record.parentId || (await existsHere(Folder, ctx.workspaceId, record.parentId));
      const parentPending = pending.some((other) => String(other._id) === String(record.parentId));
      (parentReady || !parentPending ? ready : waiting).push(record);
    }
    await restoreRecords({
      Model: Folder,
      records: ready,
      fields: FIELDS.folders,
      label: 'folders',
      ctx,
      prepare: async (doc) => {
        // Drive folders (no project) always have a home.
        if (doc.projectId && !(await existsHere(Project, ctx.workspaceId, doc.projectId)))
          return { skip: 'belongs to a project that no longer exists' };
        return {
          ...doc,
          projectId: doc.projectId ?? null,
          parentId: await idOrNull(Folder, ctx.workspaceId, doc.parentId),
        };
      },
    });
    pending = waiting;
  }
}

function restoreTasks(ctx, records) {
  return restoreRecords({
    Model: Task,
    records,
    fields: FIELDS.tasks,
    label: 'tasks',
    ctx,
    prepare: async (doc) => ({
      ...doc,
      projectId: await idOrNull(Project, ctx.workspaceId, doc.projectId),
      assigneeId: ctx.members.has(String(doc.assigneeId)) ? doc.assigneeId : null,
    }),
  });
}

function restoreEvents(ctx, records) {
  return restoreRecords({
    Model: Event,
    records,
    fields: FIELDS.events,
    label: 'events',
    ctx,
    prepare: async (doc) => ({
      ...doc,
      projectId: await idOrNull(Project, ctx.workspaceId, doc.projectId),
      clientId: await idOrNull(Client, ctx.workspaceId, doc.clientId),
      assigneeIds: (doc.assigneeIds ?? []).filter((id) => ctx.members.has(String(id))),
    }),
  });
}

// A private note only comes back for its author, and only while they are still
// on the team; a shared note whose author left is kept under the person restoring.
function restoreNotes(ctx, records) {
  return restoreRecords({
    Model: QuickNote,
    records,
    fields: FIELDS.notes,
    label: 'notes',
    ctx,
    prepare: async (doc) => {
      const authorHere = ctx.members.has(String(doc.createdBy));
      if (doc.visibility !== 'workspace' && String(doc.createdBy) !== String(ctx.userId)) {
        return { skip: "is someone else's private note" };
      }
      const projectIds = [];
      for (const id of Array.isArray(doc.projectIds) ? doc.projectIds : []) {
        if (await existsHere(Project, ctx.workspaceId, id)) projectIds.push(id);
      }
      return { ...doc, projectIds, createdBy: authorHere ? doc.createdBy : ctx.userId };
    },
  });
}

// Bytes come only from the zip, never from a storage key, and go through the
// same content check and quota as an upload.
async function prepareFile(ctx, zip, record, doc) {
  const category = categoryFor(String(doc.extension ?? '').toLowerCase());
  if (!category) return { skip: 'has a file type that is not allowed' };
  if (!record.zipPath || !zip.has(record.zipPath))
    return { skip: 'is not in this backup (it was made without files)' };
  if (doc.projectId && !(await existsHere(Project, ctx.workspaceId, doc.projectId)))
    return { skip: 'belongs to a project that no longer exists' };
  if (ctx.storageFull) return { skip: 'did not fit in the remaining storage' };

  const folderId =
    (await idOrNull(Folder, ctx.workspaceId, doc.folderId)) ??
    (await fallbackFolderId(ctx.workspaceId, doc.projectId ?? null));
  const localPath = path.join(storageConfig.stagingDir, `restore-file-${randomUUID()}`);
  const size = zip.sizeOf(record.zipPath);
  try {
    await zip.extractTo(record.zipPath, localPath);
    const stored = await ingestFile({
      workspaceId: ctx.workspaceId,
      localPath,
      size,
      extension: doc.extension,
      countsTowardStorage: !doc.deletedAt,
    });
    ctx.undoFile.set(String(doc._id), stored.undo);
    const linkedProjectIds = [];
    for (const id of Array.isArray(doc.linkedProjectIds) ? doc.linkedProjectIds : []) {
      if (await existsHere(Project, ctx.workspaceId, id)) linkedProjectIds.push(id);
    }
    return {
      ...doc,
      linkedProjectIds,
      folderId,
      category,
      size: stored.size,
      mime: stored.mime,
      storageKey: stored.storageKey,
      uploadedBy: doc.uploadedBy ?? ctx.userId,
    };
  } catch (err) {
    if (err.code === 'STORAGE_FULL') ctx.storageFull = true;
    return {
      skip:
        err instanceof AppError
          ? `could not be restored: ${err.message}`
          : 'could not be read from the zip',
    };
  } finally {
    await fs.rm(localPath, { force: true });
  }
}

async function restoreFiles(ctx, records, zip) {
  const byId = new Map(
    (Array.isArray(records) ? records : []).map((record) => [String(record?._id), record]),
  );
  await restoreRecords({
    Model: StoredFile,
    records: [...byId.values()],
    fields: FIELDS.files,
    label: 'files',
    ctx,
    prepare: (doc) => prepareFile(ctx, zip, byId.get(String(doc._id)), doc),
  });
}

// Files whose document failed to save give their space and bytes back.
async function undoUnsavedFiles(ctx) {
  for (const [fileId, undo] of ctx.undoFile) {
    if (!(await StoredFile.exists({ _id: fileId, workspaceId: ctx.workspaceId }))) await undo();
  }
}

export async function restoreBackup({ workspaceId, userId, zipPath }) {
  const zip = await openBackupZip(zipPath);
  try {
    const manifest = await readManifest(zip, workspaceId);
    const summary = {
      backupCreatedAt: manifest.createdAt,
      collections: Object.fromEntries(
        RESTORABLE_COLLECTIONS.map((name) => [name, newCollectionResult()]),
      ),
      problems: [],
    };
    const ctx = {
      workspaceId,
      userId,
      summary,
      members: await activeMemberIds(workspaceId),
      undoFile: new Map(),
      storageFull: false,
    };
    const read = (collection) => zip.readJson(dataPath(collection));

    await restoreClients(ctx, await read('clients'));
    await restoreProjects(ctx, await read('projects'));
    await restoreFolders(ctx, await read('folders'));
    await restoreTasks(ctx, await read('tasks'));
    await restoreEvents(ctx, await read('events'));
    await restoreFiles(ctx, await read('files'), zip);
    await restoreNotes(ctx, await read('notes'));
    await undoUnsavedFiles(ctx);
    if (ctx.storageFull) addProblem(summary, 'Storage filled up, so some files were not restored.');

    await AuditLog.create({
      actorId: userId,
      action: 'workspace.restore',
      workspaceId,
      details: { backupCreatedAt: manifest.createdAt, collections: summary.collections },
    });
    return summary;
  } finally {
    zip.close();
  }
}
