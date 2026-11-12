import { Router } from 'express';
import { canManage } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { projectParamsSchema } from '../projects/projects.validation.js';
import * as controller from './projectShare.controller.js';
import {
  createSharedTaskSchema,
  sharedCalendarQuerySchema,
  sharedFileParamsSchema,
  sharedFilesQuerySchema,
  sharedFileUrlQuerySchema,
  sharedPreviewUrlsSchema,
  sharedTaskParamsSchema,
  shareParamsSchema,
  shareSettingsSchema,
  updateSharedTaskSchema,
} from './projectShare.validation.js';

// Mounted at /workspaces/:workspaceId/projects/:projectId/share.
// Who can share a project: the same people who can edit its details.
export const projectShareSettingsRouter = Router({ mergeParams: true });

projectShareSettingsRouter.use(canManage, validate({ params: projectParamsSchema }));
projectShareSettingsRouter.get('/', controller.getSettings);
projectShareSettingsRouter.patch(
  '/',
  validate({ body: shareSettingsSchema }),
  controller.updateSettings,
);
projectShareSettingsRouter.post('/reset', controller.resetLink);

// Mounted at /share/:token, behind optionalAuthenticate.
export const publicShareRouter = Router({ mergeParams: true });

publicShareRouter.use(validate({ params: shareParamsSchema }), controller.loadShare);
publicShareRouter.get('/', controller.getProject);
publicShareRouter.get('/tasks', controller.listTasks);
publicShareRouter.post('/tasks', validate({ body: createSharedTaskSchema }), controller.createTask);
publicShareRouter.patch(
  '/tasks/:taskId',
  validate({ params: sharedTaskParamsSchema, body: updateSharedTaskSchema }),
  controller.updateTask,
);
publicShareRouter.get('/files', validate({ query: sharedFilesQuerySchema }), controller.listFiles);
publicShareRouter.post(
  '/files/preview-urls',
  validate({ body: sharedPreviewUrlsSchema }),
  controller.previewUrls,
);
publicShareRouter.get(
  '/files/:fileId/url',
  validate({ params: sharedFileParamsSchema, query: sharedFileUrlQuerySchema }),
  controller.fileUrl,
);
publicShareRouter.get(
  '/calendar',
  validate({ query: sharedCalendarQuerySchema }),
  controller.calendar,
);
publicShareRouter.get('/notes', controller.listNotes);
