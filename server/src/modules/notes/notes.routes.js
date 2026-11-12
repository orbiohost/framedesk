import { Router } from 'express';
import { z } from 'zod';
import { canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as notesService from './notes.service.js';

const saveNoteSchema = z.object({
  body: z.string().max(5000, 'Keep the note under 5000 characters'),
});

const router = Router();

router.get(
  '/me',
  canView,
  asyncHandler(async (req, res) => {
    const note = await notesService.getNote(req.workspace._id, req.user._id);
    sendSuccess(res, { note });
  }),
);

router.patch(
  '/me',
  canView,
  validate({ body: saveNoteSchema }),
  asyncHandler(async (req, res) => {
    const note = await notesService.saveNote(req.workspace._id, req.user._id, req.body);
    sendSuccess(res, { note });
  }),
);

export default router;
