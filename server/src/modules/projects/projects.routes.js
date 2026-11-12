import { Router } from 'express';
import { canAdminister, canManage, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { projectShareSettingsRouter } from '../projectShare/projectShare.routes.js';
import * as controller from './projects.controller.js';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  projectParamsSchema,
  updateProjectSchema,
} from './projects.validation.js';

const router = Router();

router.get('/', canView, validate({ query: listProjectsQuerySchema }), controller.list);
router.post('/', canManage, validate({ body: createProjectSchema }), controller.create);
router.get('/:projectId', canView, validate({ params: projectParamsSchema }), controller.getOne);
router.patch(
  '/:projectId',
  canManage,
  validate({ params: projectParamsSchema, body: updateProjectSchema }),
  controller.update,
);
// Deleting wipes the project's files, tasks and events, so only owners and admins can.
router.delete(
  '/:projectId',
  canAdminister,
  validate({ params: projectParamsSchema }),
  controller.remove,
);

// The project's public share link: who can open it and what they may do.
router.use('/:projectId/share', projectShareSettingsRouter);

export default router;
