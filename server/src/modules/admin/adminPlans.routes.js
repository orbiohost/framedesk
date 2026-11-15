import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { objectId } from '../../utils/zodHelpers.js';
import {
  createCoupon,
  deleteCoupon,
  listCoupons,
  updateCoupon,
} from '../billing/discounts.service.js';
import { PLAN_CODES } from '../plans/plans.catalog.js';
import { BILLING_INTERVALS, getCatalog, updateCatalog } from '../plans/plans.service.js';
import { recordAudit } from './auditLog.service.js';

// Mounted at /admin (superadmins only): the price list and coupons.
const router = Router();

const rupees = z.number().int().min(1).max(10_000_000);
const features = z.array(z.string().trim().min(1).max(120)).max(12);
const name = z.string().trim().min(1).max(40);
const summary = z.string().trim().max(200);

const paidPlan = z.object({
  name,
  summary,
  features,
  monthlyPrice: rupees,
  // null or missing: 10 months' worth.
  yearlyPrice: rupees.nullable().optional(),
  storageGB: z.number().int().min(1).max(100_000),
  highlighted: z.boolean(),
});

const catalogSchema = z.object({
  plans: z.object(Object.fromEntries(PLAN_CODES.map((code) => [code, paidPlan]))).optional(),
  free: z.object({ name, summary, features, storageGB: z.number().min(0.5).max(1000) }).optional(),
  offer: z
    .object({
      enabled: z.boolean(),
      code: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_-]{2,30}$/, 'Letters, numbers, - or _'),
      label: z.string().trim().min(1).max(40),
      percentOff: z.number().int().min(1).max(90),
      endsAt: z.coerce.date(),
    })
    .optional(),
  referral: z
    .object({
      enabled: z.boolean(),
      rewardGB: z.number().min(0).max(1000),
      rewardLimit: z.number().int().min(0).max(1000),
      discountPercent: z.number().int().min(0).max(90),
    })
    .optional(),
});

const couponSchema = z.object({
  code: z.string().trim().min(3).max(30),
  description: z.string().trim().max(200).optional(),
  percentOff: z.number().int().min(1).max(100).nullable().optional(),
  amountOff: rupees.nullable().optional(),
  planCodes: z.array(z.enum(PLAN_CODES)).optional(),
  intervals: z.array(z.enum(BILLING_INTERVALS)).optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perAccountLimit: z.number().int().min(1).max(100).optional(),
  active: z.boolean().optional(),
});
const couponParams = z.object({ couponId: objectId });

router.get(
  '/plans',
  asyncHandler(async (req, res) => {
    sendSuccess(res, { catalog: await getCatalog() });
  }),
);

router.put(
  '/plans',
  validate({ body: catalogSchema }),
  asyncHandler(async (req, res) => {
    const catalog = await updateCatalog(req.body, req.user._id);
    await recordAudit({ actorId: req.user._id, action: 'plans.update', details: req.body });
    sendSuccess(res, { catalog });
  }),
);

router.get(
  '/coupons',
  asyncHandler(async (req, res) => {
    sendSuccess(res, { coupons: await listCoupons() });
  }),
);

router.post(
  '/coupons',
  validate({ body: couponSchema }),
  asyncHandler(async (req, res) => {
    const coupon = await createCoupon(req.body, req.user._id);
    await recordAudit({ actorId: req.user._id, action: 'coupon.create', details: req.body });
    sendSuccess(res, { coupon }, { status: 201 });
  }),
);

router.put(
  '/coupons/:couponId',
  validate({ params: couponParams, body: couponSchema.omit({ code: true }) }),
  asyncHandler(async (req, res) => {
    const coupon = await updateCoupon(req.params.couponId, req.body);
    await recordAudit({
      actorId: req.user._id,
      action: 'coupon.update',
      details: { code: coupon.code, ...req.body },
    });
    sendSuccess(res, { coupon });
  }),
);

router.delete(
  '/coupons/:couponId',
  validate({ params: couponParams }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await deleteCoupon(req.params.couponId));
  }),
);

export default router;
