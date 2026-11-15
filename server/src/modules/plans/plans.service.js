import { AppError } from '../../utils/AppError.js';
import { cached } from '../../utils/cache.js';
import { getAiSettings, publicAiPricing } from '../ai/aiSettings.service.js';
import { getGstRules } from '../billing/billingSettings.service.js';
import { isRazorpayEnabled } from '../billing/razorpay.client.js';
import {
  CURRENCY,
  FREE_DEFAULTS,
  OFFER_DEFAULTS,
  PLANS,
  REFERRAL_DEFAULTS,
  YEARLY_MONTHS_CHARGED,
} from './plans.catalog.js';
import { PLAN_SETTINGS_SCOPE, PlanSettings } from './planSettings.model.js';

export const BILLING_INTERVALS = ['monthly', 'yearly'];

const GB = 1024 ** 3;

function list(value, fallback) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : fallback;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// A default plan with whatever the admin saved for it on top.
function mergePlan(plan, saved = {}) {
  const monthlyPrice = num(saved.monthlyPrice, plan.monthlyPrice);
  return {
    code: plan.code,
    name: saved.name || plan.name,
    summary: saved.summary ?? plan.summary,
    features: list(saved.features, plan.features),
    monthlyPrice,
    // null: 10 months' worth (2 months free).
    yearlyPrice: saved.yearlyPrice ? num(saved.yearlyPrice, null) : null,
    storageGB: num(saved.storageGB, plan.storageGB),
    maxProjects: plan.maxProjects ?? null,
    maxMembers: plan.maxMembers ?? null,
    highlighted: saved.highlighted ?? Boolean(plan.highlighted),
  };
}

function toCatalog(doc) {
  const offer = { ...OFFER_DEFAULTS, ...(doc?.offer ?? {}) };
  return {
    plans: PLANS.map((plan) => mergePlan(plan, doc?.plans?.[plan.code])),
    free: {
      ...FREE_DEFAULTS,
      ...(doc?.free ?? {}),
      features: list(doc?.free?.features, FREE_DEFAULTS.features),
      storageGB: num(doc?.free?.storageGB, FREE_DEFAULTS.storageGB),
    },
    offer: {
      enabled: Boolean(offer.enabled),
      code: String(offer.code || 'OFFER').toUpperCase(),
      label: offer.label || 'Offer',
      percentOff: Math.min(90, num(offer.percentOff, 0)),
      endsAt: offer.endsAt ? new Date(offer.endsAt) : null,
    },
    referral: {
      ...REFERRAL_DEFAULTS,
      ...(doc?.referral ?? {}),
      enabled: doc?.referral?.enabled ?? REFERRAL_DEFAULTS.enabled,
      rewardGB: num(doc?.referral?.rewardGB, REFERRAL_DEFAULTS.rewardGB),
      rewardLimit: num(doc?.referral?.rewardLimit, REFERRAL_DEFAULTS.rewardLimit),
      discountPercent: Math.min(
        90,
        num(doc?.referral?.discountPercent, REFERRAL_DEFAULTS.discountPercent),
      ),
    },
    updatedAt: doc?.updatedAt ?? null,
  };
}

// The last catalogue read, for places that only need a plan's name right now.
let latest = toCatalog(null);

export async function getCatalog() {
  const doc = await cached('plan-settings', [PLAN_SETTINGS_SCOPE], () =>
    PlanSettings.findOne({ key: 'default' }).lean(),
  );
  latest = toCatalog(doc);
  return latest;
}

export function planNameNow(code) {
  if (code === 'free') return latest.free.name;
  return latest.plans.find((plan) => plan.code === code)?.name ?? null;
}

export function isOfferLive(offer, now = new Date()) {
  return Boolean(offer.enabled && offer.percentOff > 0 && offer.endsAt && now <= offer.endsAt);
}

function yearlyOf(plan) {
  return plan.yearlyPrice ?? plan.monthlyPrice * YEARLY_MONTHS_CHARGED;
}

// The offer price: a full year at the monthly rate, less the offer, to the ₹10 below.
function offerYearly(plan, offer) {
  const price = Math.floor((plan.monthlyPrice * 12 * (1 - offer.percentOff / 100)) / 10) * 10;
  return Math.max(1, Math.min(price, yearlyOf(plan)));
}

function planPrices(plan) {
  return {
    monthly: plan.monthlyPrice,
    yearly: yearlyOf(plan),
    yearlyAtMonthlyRate: plan.monthlyPrice * 12,
  };
}

function toPublicPlan(plan, ai) {
  return {
    code: plan.code,
    name: plan.name,
    summary: plan.summary,
    features: plan.features,
    storageGB: plan.storageGB,
    maxProjects: plan.maxProjects,
    maxMembers: plan.maxMembers,
    highlighted: plan.highlighted,
    prices: planPrices(plan),
    // AI usage relative to the smallest plan (1, 5, 15...); null while the assistant is off.
    aiUsage: ai ? (ai.usageMultiplier[plan.code] ?? 1) : null,
  };
}

function toPublicOffer(catalog) {
  const { code, label, percentOff, endsAt } = catalog.offer;
  return {
    code,
    label,
    interval: 'yearly',
    percentOff,
    endsAt,
    yearlyPrices: Object.fromEntries(
      catalog.plans.map((plan) => [plan.code, offerYearly(plan, catalog.offer)]),
    ),
  };
}

export async function getPricing(now = new Date()) {
  const [gst, aiSettings, catalog] = await Promise.all([
    getGstRules(),
    getAiSettings(),
    getCatalog(),
  ]);
  const ai = publicAiPricing(aiSettings);
  const { free, referral } = catalog;
  return {
    currency: CURRENCY,
    yearlyMonthsCharged: YEARLY_MONTHS_CHARGED,
    plans: catalog.plans.map((plan) => toPublicPlan(plan, ai)),
    free: {
      code: 'free',
      name: free.name,
      storageGB: free.storageGB,
      summary: free.summary,
      features: free.features,
    },
    ai,
    offer: isOfferLive(catalog.offer, now) ? toPublicOffer(catalog) : null,
    referral: referral.enabled
      ? { rewardGB: referral.rewardGB, discountPercent: referral.discountPercent }
      : null,
    // GST is added on top of these prices when it applies.
    tax: { applies: gst.applies, rate: gst.rate, name: 'GST' },
    onlinePayment: isRazorpayEnabled(),
    serverTime: now,
  };
}

export function findPlan(catalog, code) {
  const plan = catalog.plans.find((candidate) => candidate.code === code);
  if (!plan) throw AppError.badRequest('Unknown plan', 'UNKNOWN_PLAN');
  return plan;
}

export function planStorageBytes(plan) {
  return plan.storageGB * GB;
}

export async function freeStorageBytes() {
  return (await getCatalog()).free.storageGB * GB;
}

// The price is always worked out here, never taken from the client.
export async function quote(planCode, interval, now = new Date()) {
  const catalog = await getCatalog();
  const plan = findPlan(catalog, planCode);
  if (interval === 'yearly' && isOfferLive(catalog.offer, now)) {
    return { plan, amount: offerYearly(plan, catalog.offer), offerCode: catalog.offer.code };
  }
  const prices = planPrices(plan);
  return { plan, amount: interval === 'yearly' ? prices.yearly : prices.monthly, offerCode: null };
}

// Admin → Plans & coupons. Only the fields an admin can edit are kept.
export async function updateCatalog(input, adminId) {
  const set = { updatedBy: adminId };
  if (input.plans) {
    set.plans = Object.fromEntries(
      PLANS.filter((plan) => input.plans[plan.code]).map((plan) => {
        const saved = input.plans[plan.code];
        return [
          plan.code,
          {
            name: saved.name,
            summary: saved.summary,
            features: saved.features,
            monthlyPrice: saved.monthlyPrice,
            yearlyPrice: saved.yearlyPrice ?? null,
            storageGB: saved.storageGB,
            highlighted: saved.highlighted,
          },
        ];
      }),
    );
  }
  if (input.free) set.free = input.free;
  if (input.offer) set.offer = input.offer;
  if (input.referral) set.referral = input.referral;
  await PlanSettings.findOneAndUpdate({ key: 'default' }, { $set: set }, { upsert: true });
  return getCatalog();
}
