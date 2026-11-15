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
  return {
    amount,
    per: 'year',
    compareAt: plan.prices.yearlyAtMonthlyRate,
    note: offerPrice ? `${offer.percentOff}% off` : '2 months free',
    monthlyEquivalent: Math.round(amount / 12),
    isOffer: Boolean(offerPrice),
  };
}

export function storageLabel(plan) {
  return plan.storageGB >= 1024 ? `${plan.storageGB / 1024} TB` : `${plan.storageGB} GB`;
}

// Free, trial and plan-less workspaces see upgrade prompts; paying ones don't.
export function needsUpgrade(workspace) {
  return ['free', 'trialing', 'none', 'read_only', 'canceled'].includes(workspace.billing.status);
}
