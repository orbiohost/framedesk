import { usePricing } from '../../../features/billing/hooks.js';
import { offerDeadline, timeLeftLabel } from '../../../features/billing/offerTiming.js';
import { useNow } from '../../../lib/useNow.js';

// Thin strip above the site header while the launch offer runs.
export function OfferBar() {
  const { data: pricing } = usePricing();
  const now = useNow();
  const offer = pricing?.offer;
  const timeLeft = offer ? timeLeftLabel(offer.endsAt, now) : null;
  if (!timeLeft) return null;

  return (
    <a href="/pricing" className="pill-active block px-4 py-2 text-center text-sm hover:opacity-95">
      <span className="text-accent font-semibold">{offer.percentOff}% off yearly plans</span>
      <span className="opacity-80">
        {' '}
        · launch offer until {offerDeadline(offer.endsAt)} · {timeLeft}
      </span>
      <span className="ml-2 underline underline-offset-4">See prices</span>
    </a>
  );
}
