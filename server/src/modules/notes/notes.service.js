import { Note } from './note.model.js';

function toNoteDto(note) {
  return { body: note?.body ?? '', updatedAt: note?.updatedAt ?? null };
}

export async function getNote(workspaceId, userId) {
  return toNoteDto(await Note.findOne({ workspaceId, userId }).lean());
}

export async function saveNote(workspaceId, userId, { body }) {
  const note = await Note.findOneAndUpdate(
    { workspaceId, userId },
    { $set: { body } },
    { new: true, upsert: true, runValidators: true },
  ).lean();
  return toNoteDto(note);
}
