// The default price list. The platform admin can change names, prices,
// storage, features, the free plan, the yearly offer and the referral rewards
// (Admin → Plans & coupons); what they save lives in PlanSettings and wins over
// these. Plan codes never change: payments and AI limits are keyed by them.

export const CURRENCY = 'INR';

// Yearly billing: pay for 10 months, get 12 (unless the admin sets a yearly price).
export const YEARLY_MONTHS_CHARGED = 10;

export const PLAN_CODES = Object.freeze(['starter', 'studio', 'agency']);

export const PLANS = Object.freeze([
  {
    code: 'starter',
    name: 'Starter',
    monthlyPrice: 199,
    storageGB: 50,
    maxProjects: 3,
    summary: 'For a solo editor or designer.',
    features: [
      '3 active projects',
      'Client review links',
      'Notes & Briefs: AI meeting notes',
      'Resumable uploads up to 20 GB a file',
    ],
  },
  {
    code: 'studio',
    name: 'Studio',
    monthlyPrice: 599,
    storageGB: 250,
    maxProjects: null,
    maxMembers: 10,
    summary: 'For a small team working on several clients at once.',
    features: [
      'Unlimited projects',
      'Up to 10 members',
      'Per-project freelancer access',
      'More AI usage for transcripts and briefs',
    ],
    highlighted: true,
  },
  {
    code: 'agency',
    name: 'Agency',
    monthlyPrice: 1299,
    storageGB: 1024,
    maxProjects: null,
    maxMembers: 30,
    summary: 'For studios with a steady flow of video work.',
    features: ['Unlimited projects', 'Up to 30 members', 'The most AI usage', 'Priority support'],
  },
]);

// Everyone has this until they pay; it can't be bought.
export const FREE_DEFAULTS = Object.freeze({
  name: 'Free',
  storageGB: 1,
  summary: 'Free for as long as you like.',
  features: [
    '1 GB of storage',
    'Projects, tasks, calendar and notes',
    'Client review links',
    'AI assistant with a small usage limit',
  ],
});

// A percentage off yearly plans until a date. The yearly offer price is the
// full year at the monthly rate minus the percentage, rounded down to ₹10.
export const OFFER_DEFAULTS = Object.freeze({
  enabled: true,
  code: 'LAUNCH40',
  label: 'Launch offer',
  percentOff: 40,
  endsAt: '2026-12-31T23:59:59+05:30',
});

// Profit guard: however offers, coupons and referral discounts combine, a
// plan is never sold for more than this much off its full price (the monthly
// price, or 12 × monthly for a year). Stops a 40% yearly offer plus a 20%
// referral plus a coupon from selling a year far below cost.
export const PRICING_DEFAULTS = Object.freeze({
  maxDiscountPercent: 50,
});

// Refer & earn: the friend gets a discount on their first paid plan; whoever
// invited them gets extra storage, up to rewardLimit friends: 500 MB each,
// 1 GB at most.
export const REFERRAL_DEFAULTS = Object.freeze({
  enabled: true,
  rewardGB: 0.5,
  rewardLimit: 2,
  discountPercent: 20,
});
