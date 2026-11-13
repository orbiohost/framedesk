import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';
import {
  billingProfileSchema,
  changePasswordSchema,
  invoiceParamsSchema,
  setAvatarSchema,
  updateProfileSchema,
} from './users.validation.js';

const router = Router();

router.use(authenticate);

router.get('/me', controller.getMe);
router.patch('/me', validate({ body: updateProfileSchema }), controller.updateMe);
router.put('/me/avatar', validate({ body: setAvatarSchema }), controller.setAvatar);
router.delete('/me/avatar', controller.clearAvatar);
router.put(
  '/me/billing-profile',
  validate({ body: billingProfileSchema }),
  controller.updateBillingProfile,
);
// Plans, payments and invoices for the workspaces this person owns.
router.get('/me/billing', controller.getBilling);
router.get(
  '/me/billing/invoices/:paymentId/pdf',
  validate({ params: invoiceParamsSchema }),
  controller.downloadInvoice,
);
router.post(
  '/me/password',
  authLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

export default router;
