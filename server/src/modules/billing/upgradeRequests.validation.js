import { z } from 'zod';
import { PLANS } from '../plans/plans.catalog.js';
import { BILLING_INTERVALS } from '../plans/plans.service.js';

export const createUpgradeRequestSchema = z.object({
  planCode: z.enum(PLANS.map((plan) => plan.code)),
  interval: z.enum(BILLING_INTERVALS),
  couponCode: z.string().trim().max(40).optional(),
});
