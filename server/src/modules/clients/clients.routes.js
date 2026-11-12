import { Router } from 'express';
import { canManage, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './clients.controller.js';
import {
  clientParamsSchema,
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
} from './clients.validation.js';

const router = Router();
const withClientId = validate({ params: clientParamsSchema });

router.get('/', canView, validate({ query: listClientsQuerySchema }), controller.list);
router.post('/', canManage, validate({ body: createClientSchema }), controller.create);
router.get('/:clientId', canView, withClientId, controller.getOne);
router.patch(
  '/:clientId',
  canManage,
  validate({ params: clientParamsSchema, body: updateClientSchema }),
  controller.update,
);
router.post('/:clientId/archive', canManage, withClientId, controller.archive);
router.post('/:clientId/restore', canManage, withClientId, controller.restore);
router.delete('/:clientId', canManage, withClientId, controller.remove);

export default router;
