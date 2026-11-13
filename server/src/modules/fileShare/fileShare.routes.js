import { Router } from 'express';
import { canEdit } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './fileShare.controller.js';
import {
  createFileShareSchema,
  fileLinkFileParamsSchema,
  fileLinkParamsSchema,
  fileLinkPreviewUrlsSchema,
  fileLinkUrlQuerySchema,
  fileShareParamsSchema,
  findFileShareQuerySchema,
  updateFileShareSchema,
} from './fileShare.validation.js';

// Mounted at /workspaces/:workspaceId/file-shares.
// Who can share files: the same people who can upload and change them.
export const fileSharesRouter = Router();

fileSharesRouter.use(canEdit);
fileSharesRouter.get('/', controller.list);
// Before '/:shareId' so "find" is never read as a share id.
fileSharesRouter.get('/find', validate({ query: findFileShareQuerySchema }), controller.find);
fileSharesRouter.post('/', validate({ body: createFileShareSchema }), controller.create);
fileSharesRouter.patch(
  '/:shareId',
  validate({ params: fileShareParamsSchema, body: updateFileShareSchema }),
  controller.update,
);
fileSharesRouter.delete(
  '/:shareId',
  validate({ params: fileShareParamsSchema }),
  controller.remove,
);

// Mounted at /file-share/:token, behind optionalAuthenticate.
export const publicFileShareRouter = Router({ mergeParams: true });

publicFileShareRouter.use(validate({ params: fileLinkParamsSchema }), controller.loadShare);
publicFileShareRouter.get('/', controller.getFiles);
publicFileShareRouter.post(
  '/files/preview-urls',
  validate({ body: fileLinkPreviewUrlsSchema }),
  controller.previewUrls,
);
publicFileShareRouter.get(
  '/files/:fileId/url',
  validate({ params: fileLinkFileParamsSchema, query: fileLinkUrlQuerySchema }),
  controller.fileUrl,
);
