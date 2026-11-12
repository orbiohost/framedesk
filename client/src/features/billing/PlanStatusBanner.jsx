import { Link } from 'react-router-dom';
import { daysUntil } from '../../lib/format.js';
import { canAdminister } from '../workspaces/roles.js';

const SOON_DAYS = 2;

function bannerMessage(billing) {
  if (billing.status === 'trialing') {
    const days = daysUntil(billing.trialEndsAt);
    if (days === 0)
      return 'Your trial has ended. Uploads are paused until you choose a plan; nothing is deleted.';
    if (days <= SOON_DAYS) return `Your trial ends in ${days} ${days === 1 ? 'day' : 'days'}.`;
    return null;
  }
  if (billing.status === 'none') return 'This workspace has no plan yet, so uploads are paused.';
  if (billing.status === 'read_only')
    return 'This workspace is read-only until payment goes through.';
  return null;
}

// Only interrupts when it matters: trial nearly over or ended, or no plan.
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
          See plans
        </Link>
      )}
    </div>
  );
}
