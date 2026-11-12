import { Router } from 'express';
import { canView } from '../../middleware/requireWorkspaceRole.js';
import * as controller from './members.controller.js';

const router = Router();

router.get('/', canView, controller.list);

export default router;
