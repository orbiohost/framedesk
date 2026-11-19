import mongoose from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { containsInsensitive, withoutUndefined } from '../../utils/objects.js';
import { Project } from '../projects/project.model.js';
import { QuickNote } from './quickNote.model.js';

const MAX_TAGS = 20;
// A # that starts a word: "#idea" counts, "a#b" and "&#39;" do not.
const HASHTAG = /(?:^|[^\p{L}\p{N}_&/#])#([\p{L}\p{N}_-]{1,40})/gu;

// "Slow-mo intro #idea #Colour" -> ["idea", "colour"]
export function hashtagsIn(text) {
  const tags = new Set();
  for (const match of String(text ?? '').matchAll(HASHTAG)) {
    tags.add(match[1].toLowerCase());
    if (tags.size === MAX_TAGS) break;
  }
  return [...tags];
}

function toRef(doc, label) {
  return doc?._id ? { id: String(doc._id), [label]: doc[label] } : null;
}

export function toNoteDto(note, viewerId) {
  const author = toRef(note.createdBy, 'name');
  const authorId = author?.id ?? String(note.createdBy);
  return {
    id: String(note._id),
    title: note.title,
    body: note.body,
    tags: note.tags,
    pinned: note.pinned,
    visibility: note.visibility,
    // A project deleted since the note was written drops out of the populated list.
    projects: (note.projectIds ?? []).map((project) => toRef(project, 'title')).filter(Boolean),
    author,
    isMine: authorId === String(viewerId),
    source: note.source
      ? {
          kind: note.source.kind,
          threadId: String(note.source.threadId),
          messageId: String(note.source.messageId),
          question: note.source.question ?? null,
        }
      : null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function populateRefs(query, workspaceId) {
  return query
    .populate({ path: 'projectIds', select: 'title', match: { workspaceId } })
    .populate({ path: 'createdBy', select: 'name' });
}

// What a person may see: everything they wrote, plus notes shared with the team.
export function visibleTo(userId) {
  return { $or: [{ createdBy: userId }, { visibility: 'workspace' }] };
}

async function assertProjectsExist(workspaceId, projectIds) {
  if (!projectIds?.length) return;
  const found = await Project.countDocuments({ workspaceId, _id: { $in: projectIds } });
  if (found !== projectIds.length) {
    throw AppError.badRequest(
      'One of those projects does not exist in this workspace',
      'PROJECT_NOT_FOUND',
    );
  }
}

// Someone else's private note is "not found"; a shared one is visible but not theirs to change.
async function findOwnNoteOrThrow(workspaceId, userId, noteId) {
  const note = await QuickNote.findOne({ _id: noteId, workspaceId }).lean();
  const isMine = note && String(note.createdBy) === String(userId);
  if (!note || (!isMine && note.visibility !== 'workspace')) {
    throw AppError.notFound('Note not found');
  }
  if (!isMine) throw AppError.forbidden('Only the person who wrote this note can change it');
  return note;
}

async function getNote(workspaceId, userId, noteId) {
  const note = await populateRefs(
    QuickNote.findOne({ _id: noteId, workspaceId }),
    workspaceId,
  ).lean();
  return toNoteDto(note, userId);
}

export async function listNotes(workspaceId, userId, { q, projectId, tag, scope }) {
  const conditions = [];
  if (scope === 'mine') conditions.push({ createdBy: userId });
  else if (scope === 'shared') conditions.push({ visibility: 'workspace' });
  else conditions.push(visibleTo(userId));

  if (projectId) conditions.push({ projectIds: new mongoose.Types.ObjectId(projectId) });
  if (tag) conditions.push({ tags: tag });
  if (q) {
    conditions.push({ $or: [{ title: containsInsensitive(q) }, { body: containsInsensitive(q) }] });
  }

  const notes = await populateRefs(QuickNote.find({ workspaceId, $and: conditions }), workspaceId)
    .sort({ pinned: -1, updatedAt: -1 })
    .limit(500)
    .lean();
  return notes.map((note) => toNoteDto(note, userId));
}

// source: only from server code (an AI answer being saved), never a request body.
export async function createNote(workspaceId, userId, input, { source = null } = {}) {
  await assertProjectsExist(workspaceId, input.projectIds);
  const note = await QuickNote.create({
    ...withoutUndefined(input),
    source,
    tags: hashtagsIn(input.body),
    workspaceId,
    createdBy: userId,
  });
  return getNote(workspaceId, userId, note._id);
}

export async function updateNote(workspaceId, userId, noteId, input) {
  const current = await findOwnNoteOrThrow(workspaceId, userId, noteId);
  await assertProjectsExist(workspaceId, input.projectIds);
  const changes = withoutUndefined(input);
  const title = 'title' in changes ? changes.title : current.title;
  const body = 'body' in changes ? changes.body : current.body;
  if (!title && !body?.trim()) {
    throw AppError.badRequest('Write something first', 'NOTE_EMPTY');
  }
  if (input.body !== undefined) changes.tags = hashtagsIn(input.body);
  await QuickNote.updateOne(
    { _id: noteId, workspaceId },
    { $set: changes },
    { runValidators: true },
  );
  return getNote(workspaceId, userId, noteId);
}

// Notes picked with "#" in the AI chat: each must exist and be readable by the asker.
export async function loadNotesForAi(workspaceId, userId, noteIds) {
  const unique = [...new Set((noteIds ?? []).map(String))];
  if (unique.length === 0) return [];
  const notes = await QuickNote.find({
    workspaceId,
    _id: { $in: unique },
    ...visibleTo(userId),
  })
    .select('title body updatedAt projectIds')
    .populate({ path: 'projectIds', select: 'title', match: { workspaceId } })
    .lean();
  if (notes.length !== unique.length) {
    throw AppError.notFound(
      'A note you picked was deleted or you can’t open it. Remove it and try again.',
      'NOTE_NOT_FOUND',
    );
  }
  const order = new Map(unique.map((id, index) => [id, index]));
  return notes.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
}

// Which answers in a chat this person already saved: { messageId: noteId }.
export async function savedAnswersIn(workspaceId, userId, threadId) {
  const rows = await QuickNote.find({
    workspaceId,
    createdBy: userId,
    'source.threadId': threadId,
  })
    .select('source.messageId')
    .lean();
  return Object.fromEntries(rows.map((row) => [String(row.source.messageId), String(row._id)]));
}

export async function deleteNote(workspaceId, userId, noteId) {
  await findOwnNoteOrThrow(workspaceId, userId, noteId);
  await QuickNote.deleteOne({ _id: noteId, workspaceId });
}

// Notes outlive the projects they mention; they just lose the link.
export async function unlinkProject(workspaceId, projectId) {
  await QuickNote.updateMany(
    { workspaceId, projectIds: projectId },
    { $pull: { projectIds: projectId } },
  );
}
