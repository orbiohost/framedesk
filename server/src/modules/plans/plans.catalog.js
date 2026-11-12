// The price list and the launch offer. Single source of truth for the website,
// the in-app upgrade page and upgrade requests. Phase 5 moves this into the
// database so the admin can edit it without a deploy.

export const CURRENCY = 'INR';

// Yearly billing: pay for 10 months, get 12.
export const YEARLY_MONTHS_CHARGED = 10;

export const PLANS = Object.freeze([
  {
    code: 'starter',
    name: 'Starter',
    monthlyPrice: 399,
    storageGB: 50,
    maxProjects: 3,
    summary: 'For a solo editor or designer.',
    features: ['3 active projects', 'Client review links', 'Resumable uploads up to 20 GB a file'],
  },
  {
    code: 'studio',
    name: 'Studio',
    monthlyPrice: 999,
    storageGB: 250,
    maxProjects: null,
    maxMembers: 10,
    summary: 'For a small team working on several clients at once.',
    features: ['Unlimited projects', 'Up to 10 members', 'Per-project freelancer access'],
    highlighted: true,
  },
  {
    code: 'agency',
    name: 'Agency',
    monthlyPrice: 1999,
    storageGB: 1024,
    maxProjects: null,
    maxMembers: 30,
    summary: 'For studios with a steady flow of video work.',
    features: ['Unlimited projects', 'Up to 30 members', 'Priority support'],
  },
]);

// 40% off a full year (12 x monthly), rounded down to a tidy figure.
// The same deadline applies to everyone; after it, the offer is simply not returned.
export const LAUNCH_OFFER = Object.freeze({
  code: 'LAUNCH40',
  label: 'Launch offer',
  interval: 'yearly',
  percentOff: 40,
  endsAt: new Date('2026-12-31T23:59:59+05:30'),
  yearlyPrices: { starter: 2870, studio: 7190, agency: 14390 },
});
