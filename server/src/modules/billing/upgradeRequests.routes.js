import { Router } from 'express';
import { canAdminister } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './upgradeRequests.controller.js';
import { createUpgradeRequestSchema } from './upgradeRequests.validation.js';

const router = Router();

// Plan changes are an owner/admin decision (billing.manage in Phase 3 terms).
router.get('/current', canAdminister, controller.current);
router.post('/', canAdminister, validate({ body: createUpgradeRequestSchema }), controller.create);

export default router;
