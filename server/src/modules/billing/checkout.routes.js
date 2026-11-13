import { Router } from 'express';
import { checkoutLimiter } from '../../middleware/rateLimit.js';
import { canAdminister } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { confirmCheckout, createCheckout, previewCheckout } from './checkout.service.js';
import { confirmCheckoutSchema, createCheckoutSchema } from './checkout.validation.js';

// Mounted at /workspaces/:workspaceId/checkout. Paying is an owner/admin action.
const router = Router();

router.get(
  '/quote',
  canAdminister,
  validate({ query: createCheckoutSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { quote: await previewCheckout({ pool: req.storagePool }, req.query) });
  }),
);

router.post(
  '/',
  checkoutLimiter,
  canAdminister,
  validate({ body: createCheckoutSchema }),
  asyncHandler(async (req, res) => {
    const checkout = await createCheckout({ pool: req.storagePool, user: req.user }, req.body);
    sendSuccess(res, { checkout }, { status: 201 });
  }),
);

router.post(
  '/confirm',
  canAdminister,
  validate({ body: confirmCheckoutSchema }),
  asyncHandler(async (req, res) => {
    const result = await confirmCheckout({ pool: req.storagePool }, req.body);
    sendSuccess(res, result);
  }),
);

export default router;
