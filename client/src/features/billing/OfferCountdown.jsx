import { cn } from '../../lib/cn.js';
import { useNow } from '../../lib/useNow.js';
import { offerDeadline, timeLeftLabel } from './offerTiming.js';

// The same deadline for everyone, straight from the server. Hides itself when it passes.
export function OfferCountdown({ offer, className }) {
  const now = useNow();
  const timeLeft = offer ? timeLeftLabel(offer.endsAt, now) : null;
  if (!timeLeft) return null;

  return (
    <div
      className={cn(
        'border-accent/30 bg-accent/5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm',
        className,
      )}
    >
      <span className="text-accent font-semibold">
        {offer.label}: {offer.percentOff}% off yearly plans
      </span>
      <span className="text-muted">
        Ends {offerDeadline(offer.endsAt)} ·{' '}
        <span className="text-ink font-medium tabular-nums">{timeLeft}</span>
      </span>
    </div>
  );
}
