import { Router } from 'express';
import { canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as quickNotes from './quickNotes.service.js';
import {
  createNoteSchema,
  listNotesQuerySchema,
  noteParamsSchema,
  updateNoteSchema,
} from './quickNotes.validation.js';

// Everyone on the team can jot notes; only the author can change or delete one.
const router = Router();
router.use(canView);

router.get(
  '/',
  validate({ query: listNotesQuerySchema }),
  asyncHandler(async (req, res) => {
    const notes = await quickNotes.listNotes(req.workspace._id, req.user._id, req.query);
    sendSuccess(res, { notes });
  }),
);

router.post(
  '/',
  validate({ body: createNoteSchema }),
  asyncHandler(async (req, res) => {
    const note = await quickNotes.createNote(req.workspace._id, req.user._id, req.body);
    sendSuccess(res, { note }, { status: 201 });
  }),
);

router.patch(
  '/:noteId',
  validate({ params: noteParamsSchema, body: updateNoteSchema }),
  asyncHandler(async (req, res) => {
    const note = await quickNotes.updateNote(
      req.workspace._id,
      req.user._id,
      req.params.noteId,
      req.body,
    );
    sendSuccess(res, { note });
  }),
);

router.delete(
  '/:noteId',
  validate({ params: noteParamsSchema }),
  asyncHandler(async (req, res) => {
    await quickNotes.deleteNote(req.workspace._id, req.user._id, req.params.noteId);
    sendSuccess(res, { deleted: true });
  }),
);

export default router;
