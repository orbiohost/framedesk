import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loadWorkspace } from '../../middleware/loadWorkspace.js';
import { canAdminister } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './workspaces.controller.js';
import {
  createWorkspaceSchema,
  deleteWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceParamsSchema,
} from './workspaces.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', controller.listMine);
router.post('/', validate({ body: createWorkspaceSchema }), controller.create);

router.get(
  '/:workspaceId',
  validate({ params: workspaceParamsSchema }),
  loadWorkspace,
  controller.getOne,
);
router.patch(
  '/:workspaceId',
  validate({ params: workspaceParamsSchema, body: updateWorkspaceSchema }),
  loadWorkspace,
  canAdminister,
  controller.rename,
);
// Owner only (checked in the service, together with the typed confirmation).
router.delete(
  '/:workspaceId',
  validate({ params: workspaceParamsSchema, body: deleteWorkspaceSchema }),
  loadWorkspace,
  controller.remove,
);

export default router;
