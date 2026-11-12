import { Router } from 'express';
import { canEdit, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './tasks.controller.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  taskParamsSchema,
  updateTaskSchema,
} from './tasks.validation.js';

const router = Router();

router.get('/', canView, validate({ query: listTasksQuerySchema }), controller.list);
router.post('/', canEdit, validate({ body: createTaskSchema }), controller.create);
router.patch(
  '/:taskId',
  canEdit,
  validate({ params: taskParamsSchema, body: updateTaskSchema }),
  controller.update,
);
router.delete('/:taskId', canEdit, validate({ params: taskParamsSchema }), controller.remove);

export default router;
