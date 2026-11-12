import { Router } from 'express';
import { canEdit, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './files.controller.js';
import {
  emptyTrashQuerySchema,
  fileParamsSchema,
  fileUrlQuerySchema,
  listFilesQuerySchema,
  previewUrlsQuerySchema,
  updateFileSchema,
} from './files.validation.js';

const router = Router();
const withFileId = validate({ params: fileParamsSchema });

router.get('/', canView, validate({ query: listFilesQuerySchema }), controller.list);
router.get(
  '/preview-urls',
  canView,
  validate({ query: previewUrlsQuerySchema }),
  controller.previewUrls,
);
router.get('/storage-usage', canView, controller.storageUsage);
// Before '/:fileId' so "trash" is never read as a file id.
router.delete('/trash', canEdit, validate({ query: emptyTrashQuerySchema }), controller.emptyTrash);
router.patch(
  '/:fileId',
  canEdit,
  validate({ params: fileParamsSchema, body: updateFileSchema }),
  controller.update,
);
router.get(
  '/:fileId/url',
  canView,
  validate({ params: fileParamsSchema, query: fileUrlQuerySchema }),
  controller.url,
);
router.post('/:fileId/trash', canEdit, withFileId, controller.trash);
router.post('/:fileId/restore', canEdit, withFileId, controller.restore);
router.delete('/:fileId', canEdit, withFileId, controller.removeForever);

export default router;
