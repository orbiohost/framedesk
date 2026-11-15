import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { usePricing } from '../../../features/billing/hooks.js';
import { IntervalToggle } from '../../../features/billing/IntervalToggle.jsx';
import { OfferCountdown } from '../../../features/billing/OfferCountdown.jsx';
import { FreePlanCard, PlanCard, PlanGrid } from '../../../features/billing/PlanCard.jsx';
import { cn } from '../../../lib/cn.js';
import { formatInr } from '../../../lib/format.js';

function SignupLink({ plan }) {
  return (
    <Link
      to="/signup"
      className={cn(
        'block rounded-md px-4 py-2.5 text-center text-sm font-medium',
        plan.highlighted ? 'pill-active hover:opacity-90' : 'border-line hover:bg-subtle border',
      )}
    >
      Start free, upgrade to {plan.name}
    </Link>
  );
}

// Shown while the AI assistant is on: what credits are and what extra packs cost.
function AiCreditsNote({ ai }) {
  const cheapest = [...ai.packs].sort((a, b) => a.price - b.price)[0];
  return (
    <div className="border-line mt-6 flex flex-col gap-3 rounded-lg border p-6 md:flex-row md:items-center md:gap-6">
      <span className="bg-lavender text-accent dark:text-ink grid h-10 w-10 shrink-0 place-items-center rounded-2xl">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="flex-1">
        <p className="font-medium">AI assistant included</p>
        <p className="text-muted text-sm">
          It watches your clips, reads your documents and transcripts, and answers questions about
          them. Usage refreshes every {ai.sessionHours} hours, within a weekly limit; bigger plans
          get more, and the free plan includes it too.
        </p>
      </div>
      {cheapest && (
        <p className="text-sm md:text-right">
          <span className="text-muted">Need more? Extra usage from</span>{' '}
          <span className="font-medium">
            {formatInr(cheapest.price)} for {cheapest.credits.toLocaleString('en-IN')} credits
          </span>
        </p>
      )}
    </div>
  );
}

export function PricingPreview() {
  const { data: pricing, isPending } = usePricing();
  const [billingInterval, setBillingInterval] = useState('yearly');

  return (
    <section id="pricing" className="border-line scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mb-10 grid gap-6 md:grid-cols-2 md:items-end">
          <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
            Priced by storage, because that&apos;s what video uses.
          </h2>
          <p className="text-muted md:text-right">
            Prices in INR, plus GST. Start on the free plan with 2 GB, no card needed, and upgrade
            when you need more. Need more space still? Add 100 GB packs to any plan.
          </p>
        </div>

        {isPending && <Skeleton className="h-96 w-full" />}
        {pricing && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <IntervalToggle
                value={billingInterval}
                onChange={setBillingInterval}
                offer={pricing.offer}
              />
              <OfferCountdown offer={pricing.offer} className="flex-1" />
            </div>
            <PlanGrid>
              {pricing.free && (
                <FreePlanCard
                  free={pricing.free}
                  action={
                    <Link
                      to="/signup"
                      className="border-line hover:bg-subtle block rounded-md border px-4 py-2.5 text-center text-sm font-medium"
                    >
                      Start free
                    </Link>
                  }
                />
              )}
              {pricing.plans.map((plan) => (
                <PlanCard
                  key={plan.code}
                  plan={plan}
                  interval={billingInterval}
                  offer={pricing.offer}
                  action={<SignupLink plan={plan} />}
                />
              ))}
            </PlanGrid>
            {pricing.ai && <AiCreditsNote ai={pricing.ai} />}
            {pricing.referral && (
              <p className="text-muted mt-4 text-sm">
                <span className="text-ink font-medium">Refer a studio:</span> they get{' '}
                {pricing.referral.discountPercent}% off their first plan and you get{' '}
                {pricing.referral.rewardGB} GB of extra storage.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
