import { Check, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { formatInr } from '../../lib/format.js';
import { priceFor, storageLabel } from './pricing.js';

function PriceBlock({ price }) {
  return (
    <div className="mt-6">
      <p>
        <span className="text-4xl font-semibold tabular-nums tracking-tight">
          {formatInr(price.amount)}
        </span>
        <span className="text-muted text-sm"> / {price.per}</span>
      </p>
      {price.compareAt && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
          <s className="text-muted tabular-nums">{formatInr(price.compareAt)}</s>
          <span className={cn('font-medium', price.isOffer ? 'text-accent' : 'text-success')}>
            {price.note}
          </span>
          <span className="text-muted">· {formatInr(price.monthlyEquivalent)}/month</span>
        </p>
      )}
    </div>
  );
}

// Shared by the website and the in-app upgrade page; `action` is the button or link.
export function PlanCard({ plan, interval, offer, action, badge }) {
  const price = priceFor(plan, interval, offer);
  return (
    <div className={cn('flex flex-col p-6 md:p-8', plan.highlighted && 'bg-surface')}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-3xl">{plan.name}</h3>
        {badge ??
          (plan.highlighted && (
            <span className="text-accent text-xs font-medium">Most studios pick this</span>
          ))}
      </div>
      <p className="text-muted mt-1 text-sm">{plan.summary}</p>
      <PriceBlock price={price} />
      <p className="mt-2 text-sm">
        <span className="font-medium">{storageLabel(plan)}</span>{' '}
        <span className="text-muted">of storage</span>
      </p>
      {plan.aiUsage > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-sm">
          <Sparkles className="text-accent h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-medium">AI assistant</span>
          {plan.aiUsage > 1 && <span className="text-muted">· {plan.aiUsage}× more usage</span>}
        </p>
      )}
      <ul className="mt-6 flex-1 space-y-2 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check className="text-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-8">{action}</div>
    </div>
  );
}

export function PlanGrid({ children }) {
  return (
    <div className="border-line divide-line grid divide-y rounded-lg border md:grid-cols-3 md:divide-x md:divide-y-0">
      {children}
    </div>
  );
}
