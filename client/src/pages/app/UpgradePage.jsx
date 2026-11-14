import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useCurrentUser } from '../../features/auth/hooks.js';
import {
  useCurrentUpgradeRequest,
  usePricing,
  useRequestUpgrade,
} from '../../features/billing/hooks.js';
import { CreditsSection } from '../../features/ai/CreditsSection.jsx';
import { CheckoutDialog } from '../../features/billing/CheckoutDialog.jsx';
import { IntervalToggle } from '../../features/billing/IntervalToggle.jsx';
import { OfferCountdown } from '../../features/billing/OfferCountdown.jsx';
import { PlanCard, PlanGrid } from '../../features/billing/PlanCard.jsx';
import { planLabel } from '../../features/workspaces/planLabel.js';
import { canAdminister } from '../../features/workspaces/roles.js';
import { formatInr } from '../../lib/format.js';

function RequestNotice({ request, plans, email }) {
  const plan = plans.find((candidate) => candidate.code === request.planCode);
  return (
    <Alert tone="success" className="mb-6">
      You asked for <strong>{plan?.name}</strong>, billed {request.interval} at{' '}
      <strong>{formatInr(request.quotedAmount)}</strong>
      {request.offerCode && ' (launch offer price, locked in)'}. We&apos;ll email {email} with a
      payment link (UPI, cards or netbanking) and switch your workspace over once it&apos;s paid.
      Picking another plan below replaces this request.
    </Alert>
  );
}

function ChooseButton({ plan, isRequested, isPending, onChoose }) {
  return (
    <Button
      className="w-full"
      variant={plan.highlighted ? 'primary' : 'secondary'}
      loading={isPending}
      disabled={isRequested}
      onClick={onChoose}
    >
      {isRequested ? 'Requested' : `Choose ${plan.name}`}
    </Button>
  );
}

export function UpgradePage() {
  const { workspace } = useOutletContext();
  const { data: user } = useCurrentUser();
  const { data: pricing, isPending, isError, error } = usePricing();
  const isAdmin = canAdminister(workspace);
  const { data: openRequest } = useCurrentUpgradeRequest(workspace.id, { enabled: isAdmin });
  const requestUpgrade = useRequestUpgrade(workspace.id);
  const [billingInterval, setBillingInterval] = useState('yearly');
  const [checkout, setCheckout] = useState(null);

  if (!isAdmin) {
    return (
      <EmptyState title="Plans are managed by the owner">
        Ask the owner or an admin of {workspace.name} to choose a plan.
      </EmptyState>
    );
  }
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (isError) return <Alert tone="error">{error.message}</Alert>;

  const payOnline = pricing.onlinePayment;
  const isRequested = (plan) =>
    !payOnline && openRequest?.planCode === plan.code && openRequest?.interval === billingInterval;

  function choose(plan) {
    if (payOnline) setCheckout({ planCode: plan.code, interval: billingInterval });
    else requestUpgrade.mutate({ planCode: plan.code, interval: billingInterval });
  }

  return (
    <>
      <PageHeader
        eyebrow={planLabel(workspace.billing)}
        title="Choose a plan"
        description="Priced by storage. Your projects, files and team carry over unchanged."
      />
      {openRequest && !payOnline && (
        <RequestNotice request={openRequest} plans={pricing.plans} email={user.email} />
      )}
      {requestUpgrade.error && (
        <Alert tone="error" className="mb-6">
          {requestUpgrade.error.message}
        </Alert>
      )}

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
            action={
              <ChooseButton
                plan={plan}
                isRequested={isRequested(plan)}
                isPending={
                  requestUpgrade.isPending && requestUpgrade.variables?.planCode === plan.code
                }
                onChoose={() => choose(plan)}
              />
            }
          />
        ))}
      </PlanGrid>
      <p className="text-muted mt-4 text-sm">
        Prices in INR
        {pricing.tax?.applies ? `, plus ${pricing.tax.rate}% GST` : ''}. Yearly plans are paid once
        a year.{' '}
        {payOnline
          ? 'Pay securely by UPI, card or netbanking; your plan switches on as soon as it is paid, and paying again before it ends adds the time on top.'
          : 'Nothing is charged until you pay the link we send.'}
      </p>
      {pricing.ai && (
        <CreditsSection
          workspace={workspace}
          ai={pricing.ai}
          payOnline={payOnline}
          taxNote={pricing.tax?.applies ? `, plus ${pricing.tax.rate}% GST` : ''}
          onBuy={(packCode) => setCheckout({ packCode })}
        />
      )}
      <CheckoutDialog
        workspaceId={workspace.id}
        selection={checkout}
        onClose={() => setCheckout(null)}
      />
    </>
  );
}
