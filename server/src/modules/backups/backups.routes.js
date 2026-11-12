import { Router } from 'express';
import { canAdminister } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './backups.controller.js';
import {
  createLinkSchema,
  downloadParamsSchema,
  summaryQuerySchema,
} from './backups.validation.js';

// Workspace-scoped (mounted under /workspaces/:workspaceId/backups). Owners and admins only.
export const workspaceBackupsRouter = Router();

workspaceBackupsRouter.use(canAdminister);
workspaceBackupsRouter.get('/summary', validate({ query: summaryQuerySchema }), controller.summary);
workspaceBackupsRouter.post('/link', validate({ body: createLinkSchema }), controller.createLink);
workspaceBackupsRouter.get('/history', controller.history);
// The body is the raw zip (Content-Type: application/zip), streamed to disk.
workspaceBackupsRouter.post('/restore', controller.restore);

// Public, token-checked download (mounted at /backup-downloads).
export const backupDownloadsRouter = Router();

backupDownloadsRouter.get(
  '/:token',
  validate({ params: downloadParamsSchema }),
  controller.download,
);
