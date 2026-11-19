// How a plan's price reads for the chosen interval, with the launch offer applied.
export function priceFor(plan, interval, offer) {
  if (interval === 'monthly') {
    return {
      amount: plan.prices.monthly,
      per: 'month',
      compareAt: null,
      note: null,
      isOffer: false,
    };
  }

  const offerPrice = offer?.interval === 'yearly' ? offer.yearlyPrices[plan.code] : undefined;
  const amount = offerPrice ?? plan.prices.yearly;
  const full = plan.prices.yearlyAtMonthlyRate;
  // What is really saved against 12 monthly payments: the admin may set any
  // yearly price, and the discount cap may hold an offer below its headline.
  const savedPercent = full > 0 ? Math.round(((full - amount) / full) * 100) : 0;
  const monthsFree = plan.prices.monthly > 0 ? (full - amount) / plan.prices.monthly : 0;
  const plainNote = Number.isInteger(monthsFree)
    ? `${monthsFree} month${monthsFree === 1 ? '' : 's'} free`
    : `Save ${savedPercent}%`;
  return {
    amount,
    per: 'year',
    compareAt: amount < full ? full : null,
    note: offerPrice ? `${savedPercent}% off` : savedPercent > 0 ? plainNote : null,
    monthlyEquivalent: Math.round(amount / 12),
    isOffer: Boolean(offerPrice),
  };
}

// 0.5 -> "500 MB", 3 -> "3 GB".
export function gbLabel(gb) {
  const value = Number(gb) || 0;
  return value < 1 ? `${Math.round(value * 1000)} MB` : `${Math.round(value * 10) / 10} GB`;
}

export function storageLabel(plan) {
  return plan.storageGB >= 1024 ? `${plan.storageGB / 1024} TB` : `${plan.storageGB} GB`;
}

// Free, trial and plan-less workspaces see upgrade prompts; paying ones don't.
export function needsUpgrade(workspace) {
  return ['free', 'trialing', 'none', 'read_only', 'canceled'].includes(workspace.billing.status);
}
