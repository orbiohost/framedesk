import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { usePricing } from '../../../features/billing/hooks.js';
import { IntervalToggle } from '../../../features/billing/IntervalToggle.jsx';
import { OfferCountdown } from '../../../features/billing/OfferCountdown.jsx';
import { PlanCard, PlanGrid } from '../../../features/billing/PlanCard.jsx';
import { cn } from '../../../lib/cn.js';

function SignupLink({ plan }) {
  return (
    <Link
      to="/signup"
      className={cn(
        'block rounded-md px-4 py-2.5 text-center text-sm font-medium',
        plan.highlighted ? 'pill-active hover:opacity-90' : 'border-line hover:bg-subtle border',
      )}
    >
      Start free, then {plan.name}
    </Link>
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
            Prices in INR, plus GST. Every plan starts with a 7-day free trial, no card needed. Need
            more space? Add 100 GB packs to any plan.
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
          </>
        )}
      </div>
    </section>
  );
}
