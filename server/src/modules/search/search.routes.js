import { Router } from 'express';
import { z } from 'zod';
import { canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { viewerOf } from '../files/folderAccess.js';
import { searchWorkspace } from './search.service.js';

const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });

const router = Router();

router.get(
  '/',
  canView,
  validate({ query: searchQuerySchema }),
  asyncHandler(async (req, res) => {
    const results = await searchWorkspace(req.workspace._id, viewerOf(req), req.query.q);
    sendSuccess(res, results);
  }),
);

export default router;
