import { Link } from 'react-router-dom';
import { daysUntil, formatShortDate } from '../../lib/format.js';
import { canAdminister } from '../workspaces/roles.js';

// Plans don't renew by themselves, so owners get a heads-up before one ends.
const RENEW_SOON_DAYS = 5;

function bannerMessage(billing) {
  if (billing.status === 'active' && billing.currentPeriodEnd) {
    const days = daysUntil(billing.currentPeriodEnd);
    if (days > RENEW_SOON_DAYS) return null;
    return `Your plan ends ${days <= 1 ? 'today' : `in ${days} days`} and doesn't renew by itself. Renew now and the new period is added after the current one.`;
  }
  if (billing.status === 'past_due') {
    return billing.graceEndsAt
      ? `Your plan has ended. Uploads keep working until ${formatShortDate(billing.graceEndsAt)}; renew to avoid a break.`
      : 'A payment is due for this workspace.';
  }
  if (billing.status === 'none') return 'This workspace has no plan yet, so uploads are paused.';
  if (billing.status === 'read_only')
    return 'Your plan has ended and this account is moving to the free plan (1 GB). Your files are safe; renew to keep your space.';
  return null;
}

function linkLabel(billing) {
  return ['active', 'past_due', 'read_only'].includes(billing.status) ? 'Renew' : 'See plans';
}

// Only interrupts when it matters: a plan nearly over or ended. The free plan gets no banner.
export function PlanStatusBanner({ workspace }) {
  const message = bannerMessage(workspace.billing);
  if (!message) return null;

  return (
    <div className="pill-active mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-2.5 text-sm">
      <span>{message}</span>
      {canAdminister(workspace) && (
        <Link
          to={`/w/${workspace.id}/upgrade`}
          className="text-lavender dark:text-accent font-medium underline underline-offset-4"
        >
          {linkLabel(workspace.billing)}
        </Link>
      )}
    </div>
  );
}
