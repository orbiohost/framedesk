import { AppError } from '../../utils/AppError.js';
import { getAiSettings, publicAiPricing } from '../ai/aiSettings.service.js';
import { getGstRules } from '../billing/billingSettings.service.js';
import { isRazorpayEnabled } from '../billing/razorpay.client.js';
import { CURRENCY, LAUNCH_OFFER, PLANS, YEARLY_MONTHS_CHARGED } from './plans.catalog.js';

export const BILLING_INTERVALS = ['monthly', 'yearly'];

const GB = 1024 ** 3;

export function isOfferLive(now = new Date()) {
  return now <= LAUNCH_OFFER.endsAt;
}

function planPrices(plan) {
  return {
    monthly: plan.monthlyPrice,
    yearly: plan.monthlyPrice * YEARLY_MONTHS_CHARGED,
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
    maxMembers: plan.maxMembers ?? null,
    highlighted: Boolean(plan.highlighted),
    prices: planPrices(plan),
    // AI usage relative to the smallest plan (1, 5, 15...); null while the assistant is off.
    aiUsage: ai ? (ai.usageMultiplier[plan.code] ?? 1) : null,
  };
}

function toPublicOffer() {
  const { code, label, interval, percentOff, endsAt, yearlyPrices } = LAUNCH_OFFER;
  return { code, label, interval, percentOff, endsAt, yearlyPrices };
}

export async function getPricing(now = new Date()) {
  const [gst, aiSettings] = await Promise.all([getGstRules(), getAiSettings()]);
  const ai = publicAiPricing(aiSettings);
  return {
    currency: CURRENCY,
    yearlyMonthsCharged: YEARLY_MONTHS_CHARGED,
    plans: PLANS.map((plan) => toPublicPlan(plan, ai)),
    ai,
    offer: isOfferLive(now) ? toPublicOffer() : null,
    // GST is added on top of these prices when it applies.
    tax: { applies: gst.applies, rate: gst.rate, name: 'GST' },
    onlinePayment: isRazorpayEnabled(),
    serverTime: now,
  };
}

export function findPlan(code) {
  const plan = PLANS.find((candidate) => candidate.code === code);
  if (!plan) throw AppError.badRequest('Unknown plan', 'UNKNOWN_PLAN');
  return plan;
}

export function planStorageBytes(plan) {
  return plan.storageGB * GB;
}

// The price is always worked out here, never taken from the client.
export function quote(planCode, interval, now = new Date()) {
  const plan = findPlan(planCode);
  if (interval === 'yearly' && isOfferLive(now)) {
    return { plan, amount: LAUNCH_OFFER.yearlyPrices[plan.code], offerCode: LAUNCH_OFFER.code };
  }
  const prices = planPrices(plan);
  return { plan, amount: interval === 'yearly' ? prices.yearly : prices.monthly, offerCode: null };
}
