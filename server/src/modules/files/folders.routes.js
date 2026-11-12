import { Router } from 'express';
import { canEdit, canManage, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './folders.controller.js';
import {
  createFolderSchema,
  folderAccessSchema,
  folderParamsSchema,
  listFoldersQuerySchema,
  updateFolderSchema,
} from './files.validation.js';

const router = Router();

router.get('/', canView, validate({ query: listFoldersQuerySchema }), controller.list);
router.post('/', canEdit, validate({ body: createFolderSchema }), controller.create);
router.patch(
  '/:folderId',
  canEdit,
  validate({ params: folderParamsSchema, body: updateFolderSchema }),
  controller.update,
);
// Who may open the folder: managers and up decide.
router.patch(
  '/:folderId/access',
  canManage,
  validate({ params: folderParamsSchema, body: folderAccessSchema }),
  controller.setAccess,
);
router.delete('/:folderId', canEdit, validate({ params: folderParamsSchema }), controller.remove);

export default router;
