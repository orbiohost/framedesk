import { z } from 'zod';
import { objectId, optionalText, searchQuery } from '../../utils/zodHelpers.js';
import { MAX_NOTE_PROJECTS, NOTE_VISIBILITIES } from './quickNote.model.js';

const noteFields = {
  title: optionalText(160),
  body: z.string().trim().max(10000, 'Keep it under 10,000 characters'),
  projectIds: z
    .array(objectId)
    .max(MAX_NOTE_PROJECTS, `Link at most ${MAX_NOTE_PROJECTS} projects`)
    .transform((ids) => [...new Set(ids)]),
  pinned: z.boolean(),
  visibility: z.enum(NOTE_VISIBILITIES),
};

export const noteParamsSchema = z.object({ noteId: objectId });

export const createNoteSchema = z
  .object({
    ...noteFields,
    body: noteFields.body.default(''),
    projectIds: noteFields.projectIds.optional(),
    pinned: noteFields.pinned.optional(),
    visibility: noteFields.visibility.optional(),
  })
  .refine((note) => note.title || note.body, { message: 'Write something first', path: ['body'] });

export const updateNoteSchema = z.object(noteFields).partial();

export const listNotesQuerySchema = z.object({
  q: searchQuery,
  projectId: objectId.optional(),
  tag: z.string().trim().toLowerCase().max(40).optional(),
  scope: z.enum(['all', 'mine', 'shared']).default('all'),
});
