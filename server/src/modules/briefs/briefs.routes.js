import { Router } from 'express';
import { z } from 'zod';
import { canEdit, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { objectId } from '../../utils/zodHelpers.js';
import { viewerOf } from '../files/folderAccess.js';
import {
  createTasksFromBrief,
  getBrief,
  listBriefTranscripts,
  regenerateBrief,
  saveBriefAsNote,
} from './briefs.service.js';

// Mounted at /workspaces/:workspaceId/briefs: the AI brief of each project's
// "Notes & Briefs" folder.
const router = Router();

const params = z.object({ projectId: objectId });
const tasksSchema = z.object({ itemIds: z.array(objectId).max(50).optional() });

router.get(
  '/:projectId',
  canView,
  validate({ params }),
  asyncHandler(async (req, res) => {
    const brief = await getBrief(req.workspace._id, req.params.projectId, viewerOf(req));
    sendSuccess(res, { brief });
  }),
);

router.get(
  '/:projectId/transcripts',
  canView,
  validate({ params }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await listBriefTranscripts(req.workspace._id, req.params.projectId, viewerOf(req)),
    );
  }),
);

router.post(
  '/:projectId/regenerate',
  canEdit,
  validate({ params }),
  asyncHandler(async (req, res) => {
    const brief = await regenerateBrief(req.workspace._id, req.params.projectId, viewerOf(req));
    sendSuccess(res, { brief });
  }),
);

router.post(
  '/:projectId/note',
  canView,
  validate({ params }),
  asyncHandler(async (req, res) => {
    const note = await saveBriefAsNote(
      req.workspace._id,
      req.user._id,
      req.params.projectId,
      viewerOf(req),
    );
    sendSuccess(res, { note }, { status: 201 });
  }),
);

router.post(
  '/:projectId/tasks',
  canEdit,
  validate({ params, body: tasksSchema }),
  asyncHandler(async (req, res) => {
    const tasks = await createTasksFromBrief(
      req.workspace._id,
      req.user._id,
      req.params.projectId,
      req.body.itemIds,
      viewerOf(req),
    );
    sendSuccess(res, { tasks }, { status: 201 });
  }),
);

export default router;
