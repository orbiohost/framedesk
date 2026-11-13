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

// Rupees with up to two decimals (paise), since totals with GST rarely round off.
const rupees = z
  .number()
  .min(0)
  .max(10_000_000)
  .refine((value) => Number.isInteger(Math.round(value * 1e8) / 1e6), 'Use at most 2 decimals');

export const recordPaymentSchema = z.object({
  amount: rupees,
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
  // Defaults to the quote plus GST; set it when the customer paid something else.
  amount: rupees.optional(),
});

const optionalSetting = (max) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value));

export const billingSettingsSchema = z
  .object({
    businessName: z.string().trim().min(1, 'Enter your business name').max(120),
    addressLine: optionalSetting(200),
    city: optionalSetting(60),
    state: optionalSetting(60),
    postalCode: optionalSetting(12),
    country: optionalSetting(60),
    email: z
      .union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email')])
      .nullable()
      .optional()
      .transform((value) => value || null),
    phone: optionalSetting(20),
    gstEnabled: z.boolean(),
    gstin: z
      .union([
        z.literal(''),
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^\d{2}[0-9A-Z]{13}$/, 'A GSTIN is 15 characters and starts with the state code'),
      ])
      .nullable()
      .optional()
      .transform((value) => value || null),
    gstRate: z.coerce.number().min(0).max(28),
    sacCode: z
      .union([
        z.literal(''),
        z
          .string()
          .trim()
          .regex(/^\d{4,8}$/, 'SAC codes are 4 to 8 digits'),
      ])
      .nullable()
      .optional()
      .transform((value) => value || null),
    invoicePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,5}$/, 'Use 1 to 5 letters or digits'),
    footerNote: optionalSetting(240),
  })
  .refine((data) => !data.gstEnabled || data.gstin, {
    path: ['gstin'],
    message: 'Add your GSTIN to charge GST',
  });
