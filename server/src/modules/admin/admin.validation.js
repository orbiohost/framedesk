import { z } from 'zod';
import { PAYMENT_METHODS } from '../billing/payment.model.js';
import { UPGRADE_REQUEST_STATUSES } from '../billing/upgradeRequest.model.js';
import { PLANS } from '../plans/plans.catalog.js';
import { BILLING_INTERVALS } from '../plans/plans.service.js';
import { BILLING_STATUSES } from '../workspaces/workspace.model.js';
import { objectId, searchQuery } from '../../utils/zodHelpers.js';

const planCode = z.enum(PLANS.map((plan) => plan.code));
const reference = z.string().trim().max(120).optional();

export const idParam = (name) => z.object({ [name]: objectId });

export const cursorQuery = z.object({ cursor: objectId.optional() });

export const usersQuerySchema = z.object({
  q: searchQuery,
  status: z.enum(['active', 'suspended']).optional(),
  cursor: objectId.optional(),
});

export const userStatusSchema = z.object({ status: z.enum(['active', 'suspended']) });

export const subscriptionsQuerySchema = z.object({
  q: searchQuery,
  status: z.enum(BILLING_STATUSES).optional(),
  plan: planCode.optional(),
});

export const adjustSubscriptionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('extend_trial'), days: z.number().int().min(1).max(90) }),
  z.object({
    action: z.literal('set_status'),
    status: z.enum(['active', 'past_due', 'read_only', 'canceled']),
  }),
  z.object({ action: z.literal('change_plan'), planCode }),
]);

export const recordPaymentSchema = z.object({
  amount: z.number().int().min(0).max(10_000_000),
  planCode,
  interval: z.enum(BILLING_INTERVALS),
  method: z.enum(PAYMENT_METHODS),
  reference,
  // Checked per request (not once at startup): allow up to a day ahead for time zones.
  paidAt: z.coerce
    .date()
    .refine(
      (date) => date.getTime() <= Date.now() + 24 * 60 * 60 * 1000,
      'Payment date is in the future',
    )
    .optional(),
});

export const paymentsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  cursor: objectId.optional(),
});

export const upgradeRequestsQuerySchema = z.object({
  status: z.enum(UPGRADE_REQUEST_STATUSES).optional(),
});

export const activateRequestSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  reference,
  // Defaults to the quoted amount; set it when the customer paid something else.
  amount: z.number().int().min(0).max(10_000_000).optional(),
});
