import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { objectId, optionalText } from '../../utils/zodHelpers.js';
import { CURRENCIES, EXPENSE_CATEGORIES, EXPENSE_CYCLES } from './adminCosts.model.js';
import {
  createExpense,
  deleteExpense,
  getCosts,
  refreshAwsBill,
  refreshBucketScan,
  updateCostSettings,
  updateExpense,
} from './adminCosts.service.js';

// Mounted at /admin/costs (superadmin only, see admin.routes.js).
const router = Router();

const settingsSchema = z
  .object({
    usdToInr: z.number().min(1).max(1000),
    s3PricePerGbMonthUsd: z.number().min(0).max(10),
    aiPricePerMillionTokensUsd: z.number().min(0).max(1000),
    aiFreeTier: z.boolean(),
    imagePriceUsd: z.number().min(0).max(10),
  })
  .partial();

const date = z.coerce.date();
const expenseSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(120),
  vendor: optionalText(120).transform((value) => value ?? ''),
  category: z.enum(EXPENSE_CATEGORIES).default('other'),
  amount: z.number().min(0).max(100_000_000),
  currency: z.enum(CURRENCIES).default('INR'),
  cycle: z.enum(EXPENSE_CYCLES).default('monthly'),
  startedAt: date,
  endedAt: date.nullable().optional(),
  renewsAt: date.nullable().optional(),
  note: optionalText(500).transform((value) => value ?? ''),
});
const params = z.object({ expenseId: objectId });

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, await getCosts());
  }),
);

router.put(
  '/settings',
  validate({ body: settingsSchema }),
  asyncHandler(async (req, res) => {
    await updateCostSettings(req.user._id, req.body);
    sendSuccess(res, await getCosts());
  }),
);

router.post(
  '/refresh-storage',
  asyncHandler(async (_req, res) => {
    await refreshBucketScan();
    sendSuccess(res, await getCosts());
  }),
);

router.post(
  '/refresh-aws',
  asyncHandler(async (req, res) => {
    await refreshAwsBill(req.user._id);
    sendSuccess(res, await getCosts());
  }),
);

router.post(
  '/expenses',
  validate({ body: expenseSchema }),
  asyncHandler(async (req, res) => {
    await createExpense(req.user._id, req.body);
    sendSuccess(res, await getCosts(), { status: 201 });
  }),
);

router.put(
  '/expenses/:expenseId',
  validate({ params, body: expenseSchema }),
  asyncHandler(async (req, res) => {
    await updateExpense(req.user._id, req.params.expenseId, req.body);
    sendSuccess(res, await getCosts());
  }),
);

router.delete(
  '/expenses/:expenseId',
  validate({ params }),
  asyncHandler(async (req, res) => {
    await deleteExpense(req.user._id, req.params.expenseId);
    sendSuccess(res, await getCosts());
  }),
);

export default router;
