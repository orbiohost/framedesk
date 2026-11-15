import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { claimReferral, getMyReferrals } from './referrals.service.js';

// Mounted at /referrals: your own code and link, and claiming a friend's.
const router = Router();
router.use(authenticate);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    sendSuccess(res, { referrals: await getMyReferrals(req.user) });
  }),
);

router.post(
  '/claim',
  validate({ body: z.object({ code: z.string().trim().min(1).max(20) }) }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await claimReferral(req.user, req.body.code));
  }),
);

export default router;
