import { z } from 'zod';
import { BILLING_INTERVALS } from '../plans/plans.service.js';

// Either a plan for an interval, or a pack of AI credits.
export const createCheckoutSchema = z.union([
  z.object({
    planCode: z.string().trim().min(1).max(40),
    interval: z.enum(BILLING_INTERVALS),
  }),
  z.object({ packCode: z.string().trim().min(1).max(40) }),
  // Reset the AI usage limits now.
  z.object({ product: z.literal('ai-reset') }),
]);

const razorpayId = (prefix) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,40}$`), 'Invalid id');

export const confirmCheckoutSchema = z.object({
  orderId: razorpayId('order'),
  paymentId: razorpayId('pay'),
  signature: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/, 'Invalid signature'),
});
