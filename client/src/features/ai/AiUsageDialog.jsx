import { ArrowUpRight, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { cn } from '../../lib/cn.js';
import { formatInr } from '../../lib/format.js';
import { usePricing } from '../billing/hooks.js';
import { CheckoutDialog } from '../billing/CheckoutDialog.jsx';
import { canAdminister } from '../workspaces/roles.js';
import { UsageDetails } from './AiUsage.jsx';
import { AI_GRADIENT } from './aiStyle.js';

// "Reset limits now · ₹99" plus the checkout it opens. Owners and admins only;
// shown when the plan has a reset price and online payment is set up.
export function AiResetButton({ workspace, status, size = 'md', className, onBeforeOpen }) {
  const { data: pricing } = usePricing();
  const [open, setOpen] = useState(false);
  const price = status?.resetPrice;
  if (!canAdminister(workspace) || !price || !pricing?.onlinePayment) return null;
  const used = (status.credits?.session.percent ?? 0) + (status.credits?.weekly.percent ?? 0);

  return (
    <>
      <Button
        variant="accent"
        size={size}
        disabled={used === 0}
        title={used === 0 ? 'Nothing used yet' : undefined}
        className={cn(AI_GRADIENT, 'border-0 text-white enabled:hover:opacity-90', className)}
        onClick={() => {
          onBeforeOpen?.();
          setOpen(true);
        }}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Reset limits now · {formatInr(price)}
      </Button>
      <CheckoutDialog
        workspaceId={workspace.id}
        selection={open ? { product: 'ai-reset' } : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// The popup behind the sidebar's AI usage meter.
export function AiUsageDialog({ workspace, status, open, onClose }) {
  const admin = canAdminister(workspace);
  const credits = status?.credits;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="AI usage"
      description="Limits refresh on their own. Reset them now if you can’t wait."
    >
      {credits && (
        <div className="space-y-5">
          <UsageDetails credits={credits} />

          <div className="border-line/70 space-y-2 border-t pt-4">
            {admin ? (
              <>
                <AiResetButton
                  workspace={workspace}
                  status={status}
                  className="w-full"
                  onBeforeOpen={onClose}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link
                    to={`/w/${workspace.id}/upgrade#ai-credits`}
                    onClick={onClose}
                    className="border-line bg-surface hover:bg-subtle inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium shadow-sm"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Extra usage
                  </Link>
                  <Link
                    to={`/w/${workspace.id}/upgrade`}
                    onClick={onClose}
                    className="border-line bg-surface hover:bg-subtle inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium shadow-sm"
                  >
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    Upgrade plan
                  </Link>
                </div>
                <p className="text-muted text-xs">
                  A reset starts both your 5-hour and weekly limits over right away. Bigger plans
                  get more usage in every window.
                </p>
              </>
            ) : (
              <p className="text-muted text-sm">
                Need more right now? Ask the workspace owner to reset the limits or upgrade the
                plan.
              </p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
