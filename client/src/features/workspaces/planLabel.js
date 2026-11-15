const PLAN_NAMES = { free: 'Free', starter: 'Starter', studio: 'Studio', agency: 'Agency' };

export function planLabel(billing) {
  const planName = PLAN_NAMES[billing.planCode] ?? 'No plan';

  // Trials are gone; one still on record is the free plan.
  if (billing.status === 'free' || billing.status === 'trialing') return 'Free plan';
  if (billing.status === 'active') return planName;
  if (billing.status === 'past_due') return `${planName} · ended, renew`;
  if (billing.status === 'read_only') return `${planName} · read-only`;
  return 'No active plan';
}

// There are no trials any more, so there is never a trial end to show.
export function trialEndsLabel() {
  return null;
}
