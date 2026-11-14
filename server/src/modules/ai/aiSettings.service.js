import { env } from '../../config/env.js';
import { cached } from '../../utils/cache.js';
import { PLANS } from '../plans/plans.catalog.js';
import { AI_SETTINGS_SCOPE, AiSettings } from './aiSettings.model.js';
import { isGeminiConfigured } from './gemini.client.js';

// Usage limits per plan until the admin sets their own, in credits (1 credit ≈
// 10,000 Gemini tokens). A typical question uses 1–3 credits.
const DEFAULT_PLAN_LIMITS = {
  starter: { session: 30, weekly: 200 },
  studio: { session: 150, weekly: 1000 },
  agency: { session: 450, weekly: 3000 },
};
const DEFAULT_TRIAL_LIMITS = { session: 15, weekly: 60 };

// About half of what a week's limit would cost in extra-usage packs: cheaper
// than topping up, dearer than upgrading for a heavy user.
const DEFAULT_RESET_PRICES = { trial: 49, starter: 99, studio: 299, agency: 699 };

export const SESSION_HOURS = 5;
export const WEEK_DAYS = 7;

export const DEFAULT_PACKS = [
  { code: 'pack-200', credits: 200, price: 199 },
  { code: 'pack-1000', credits: 1000, price: 799 },
  { code: 'pack-5000', credits: 5000, price: 2999 },
];

export const EDITABLE_FIELDS = [
  'enabled',
  'autoAnalyze',
  'model',
  'planLimits',
  'trialLimits',
  'resetPrices',
  'tokensPerCredit',
  'minChatCredits',
  'minAnalysisCredits',
  'maxAnalysisMB',
  'packs',
];

function limitsFrom(saved, fallback) {
  const session = Number(saved?.session);
  const weekly = Number(saved?.weekly);
  return {
    session: Number.isFinite(session) && session >= 0 ? session : fallback.session,
    weekly: Number.isFinite(weekly) && weekly >= 0 ? weekly : fallback.weekly,
  };
}

function toSettings(doc) {
  return {
    enabled: doc?.enabled ?? true,
    autoAnalyze: doc?.autoAnalyze ?? false,
    model: doc?.model || env.GEMINI_MODEL,
    planLimits: Object.fromEntries(
      PLANS.map((plan) => [
        plan.code,
        limitsFrom(
          doc?.planLimits?.[plan.code],
          DEFAULT_PLAN_LIMITS[plan.code] ?? DEFAULT_TRIAL_LIMITS,
        ),
      ]),
    ),
    trialLimits: limitsFrom(doc?.trialLimits, DEFAULT_TRIAL_LIMITS),
    resetPrices: Object.fromEntries(
      ['trial', ...PLANS.map((plan) => plan.code)].map((code) => {
        const saved = Number(doc?.resetPrices?.[code]);
        return [
          code,
          Number.isFinite(saved) && saved >= 0 ? saved : (DEFAULT_RESET_PRICES[code] ?? 99),
        ];
      }),
    ),
    tokensPerCredit: doc?.tokensPerCredit ?? 10_000,
    minChatCredits: doc?.minChatCredits ?? 1,
    minAnalysisCredits: doc?.minAnalysisCredits ?? 1,
    maxAnalysisMB: doc?.maxAnalysisMB ?? 1024,
    packs: (doc?.packs?.length ? doc.packs : DEFAULT_PACKS).map(({ code, credits, price }) => ({
      code,
      credits,
      price,
    })),
    updatedAt: doc?.updatedAt ?? null,
  };
}

export async function getAiSettings() {
  const doc = await cached('ai-settings', [AI_SETTINGS_SCOPE], () =>
    AiSettings.findOne({ key: 'default' }).lean(),
  );
  return toSettings(doc);
}

export async function updateAiSettings(input, adminId) {
  const next = { ...(await getAiSettings()), ...input };
  const doc = await AiSettings.findOneAndUpdate(
    { key: 'default' },
    {
      $set: {
        ...Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, next[field]])),
        updatedBy: adminId,
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  return toSettings(doc);
}

// The assistant runs only when the admin switched it on and a key is set.
export function isAiLive(settings) {
  return settings.enabled && isGeminiConfigured();
}

export function findPack(settings, code) {
  return settings.packs.find((pack) => pack.code === code) ?? null;
}

// What the pricing page shows about AI (nothing while it is off). Usage is
// shown relative to the smallest plan ("5× more usage"), never as raw numbers.
export function publicAiPricing(settings) {
  if (!isAiLive(settings)) return null;
  const base = settings.planLimits[PLANS[0].code]?.weekly || 1;
  return {
    usageMultiplier: Object.fromEntries(
      PLANS.map((plan) => [
        plan.code,
        Math.max(1, Math.round((settings.planLimits[plan.code]?.weekly ?? 0) / base)),
      ]),
    ),
    sessionHours: SESSION_HOURS,
    weekDays: WEEK_DAYS,
    packs: settings.packs,
    resetPrices: settings.resetPrices,
  };
}
