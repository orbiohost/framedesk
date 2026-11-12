import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { supportLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './support.controller.js';
import { createTicketSchema } from './support.validation.js';

// The signed-in person's own support tickets. Admin views live under /admin/support.
const router = Router();

router.use(authenticate);
router.get('/tickets', controller.listMine);
router.post('/tickets', supportLimiter, validate({ body: createTicketSchema }), controller.create);

export default router;
