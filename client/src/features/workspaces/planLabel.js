import { daysUntil, formatShortDate } from '../../lib/format.js';

const PLAN_NAMES = { starter: 'Starter', studio: 'Studio', agency: 'Agency' };

export function planLabel(billing) {
  const planName = PLAN_NAMES[billing.planCode] ?? 'No plan';

  if (billing.status === 'trialing') {
    const days = daysUntil(billing.trialEndsAt);
    return days > 0
      ? `${planName} trial · ${days} ${days === 1 ? 'day' : 'days'} left`
      : 'Trial ended';
  }
  if (billing.status === 'active') return planName;
  if (billing.status === 'past_due') return `${planName} · ended, renew`;
  if (billing.status === 'read_only') return `${planName} · read-only`;
  return 'No active plan';
}

export function trialEndsLabel(billing) {
  if (billing.status !== 'trialing' || !billing.trialEndsAt) return null;
  return `Trial ends ${formatShortDate(billing.trialEndsAt)}`;
}
