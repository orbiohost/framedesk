import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { objectId, searchQuery } from '../../utils/zodHelpers.js';
import { PLANS } from '../plans/plans.catalog.js';
import { RESET_PRICE_CODES } from './aiSettings.service.js';
import {
  accountLedger,
  adjustCredits,
  getAiAdminOverview,
  listAiAccounts,
  saveAiSettings,
  resetAccountLimits,
  setAccountAccess,
} from './aiAdmin.service.js';

// Mounted at /admin/ai, behind the superadmin check in admin.routes.js.
const router = Router();

const credits = (max) => z.number().int().min(0).max(max);
const limits = z.object({ session: credits(1_000_000), weekly: credits(10_000_000) });

const settingsSchema = z
  .object({
    enabled: z.boolean(),
    autoAnalyze: z.boolean(),
    model: z
      .string()
      .trim()
      .regex(/^[\w.-]{3,60}$/, 'Use a Gemini model name like gemini-3.5-flash'),
    planLimits: z.object(Object.fromEntries(PLANS.map((plan) => [plan.code, limits]))),
    freeLimits: limits,
    trialLimits: limits,
    resetPrices: z.object(
      Object.fromEntries(RESET_PRICE_CODES.map((code) => [code, credits(1_000_000)])),
    ),
    tokensPerCredit: z.number().int().min(100).max(10_000_000),
    minChatCredits: credits(1000),
    minAnalysisCredits: credits(1000),
    maxAnalysisMB: z.number().int().min(1).max(2000),
    packs: z
      .array(
        z.object({
          code: z
            .string()
            .trim()
            .regex(/^[a-z0-9-]{2,40}$/, 'Use lowercase letters, digits and dashes'),
          credits: z.number().int().min(1).max(10_000_000),
          price: z.number().int().min(1).max(10_000_000),
        }),
      )
      .min(1, 'Add at least one credit pack')
      .max(8)
      .refine(
        (packs) => new Set(packs.map((pack) => pack.code)).size === packs.length,
        'Each pack needs its own code',
      ),
  })
  .partial();

const workspaceParam = z.object({ workspaceId: objectId });
const accountsQuery = z.object({ q: searchQuery });
const adjustSchema = z.object({
  credits: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((value) => value !== 0, 'Enter a number of credits'),
  note: z.string().trim().max(200).optional(),
});
const accessSchema = z.object({ blocked: z.boolean() });
const ledgerQuery = z.object({ cursor: objectId.optional() });

router.get(
  '/',
  asyncHandler(async (req, res) => sendSuccess(res, await getAiAdminOverview())),
);

router.put(
  '/',
  validate({ body: settingsSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await saveAiSettings(req.body, req.user._id))),
);

router.get(
  '/accounts',
  validate({ query: accountsQuery }),
  asyncHandler(async (req, res) => sendSuccess(res, { accounts: await listAiAccounts(req.query) })),
);

router.post(
  '/accounts/:workspaceId/credits',
  validate({ params: workspaceParam, body: adjustSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      account: await adjustCredits(req.params.workspaceId, req.user._id, req.body),
    }),
  ),
);

router.post(
  '/accounts/:workspaceId/access',
  validate({ params: workspaceParam, body: accessSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      account: await setAccountAccess(req.params.workspaceId, req.user._id, req.body),
    }),
  ),
);

router.post(
  '/accounts/:workspaceId/reset-limits',
  validate({ params: workspaceParam }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, { account: await resetAccountLimits(req.params.workspaceId, req.user._id) }),
  ),
);

router.get(
  '/accounts/:workspaceId/ledger',
  validate({ params: workspaceParam, query: ledgerQuery }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await accountLedger(req.params.workspaceId, req.query)),
  ),
);

export default router;
