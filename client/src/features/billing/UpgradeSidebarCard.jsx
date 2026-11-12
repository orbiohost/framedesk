import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { planLabel } from '../workspaces/planLabel.js';
import { canAdminister } from '../workspaces/roles.js';
import { usePricing } from './hooks.js';
import { needsUpgrade } from './pricing.js';

// Sits above the storage meter for trial and plan-less workspaces.
export function UpgradeSidebarCard({ workspace }) {
  const { data: pricing } = usePricing();
  if (!needsUpgrade(workspace)) return null;

  const offer = pricing?.offer;
  return (
    <div className="widget-lavender mb-3 rounded-2xl p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="text-accent h-3.5 w-3.5" aria-hidden="true" />
        {planLabel(workspace.billing)}
      </p>
      <p className="text-ink/70 mt-1 text-xs">
        {offer
          ? `${offer.percentOff}% off yearly plans until ${new Date(offer.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`
          : 'Keep your projects and files when the trial ends.'}
      </p>
      {canAdminister(workspace) ? (
        <Link
          to={`/w/${workspace.id}/upgrade`}
          className="pill-active mt-2.5 block rounded-full px-3 py-1.5 text-center text-[13px] font-medium hover:opacity-90"
        >
          Upgrade
        </Link>
      ) : (
        <p className="text-muted mt-2 text-xs">Ask the workspace owner to upgrade.</p>
      )}
    </div>
  );
}
