import { Check, CircleCheck, Lock, TicketPercent, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { formatInrExact } from '../../lib/format.js';
import { shortDate } from '../admin/adminFormat.js';
import { useCurrentUser } from '../auth/hooks.js';
import { BillingDetailsForm, hasBillingAddress } from './BillingDetailsForm.jsx';
import { useCheckoutQuote, useConfirmCheckout, useCreateCheckout } from './hooks.js';
import { CheckoutDismissed, openRazorpayCheckout } from './razorpayCheckout.js';
import { TaxBreakdown } from './TaxBreakdown.jsx';

const ACCENT = '#8b54e8';

function Steps({ current }) {
  const steps = [
    { id: 'details', label: 'Billing details' },
    { id: 'review', label: 'Review & pay' },
  ];
  const currentIndex = steps.findIndex((step) => step.id === current);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 && <span className="bg-line h-px w-6" aria-hidden="true" />}
            <span
              className={cn(
                'grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold',
                active
                  ? 'pill-active'
                  : done
                    ? 'bg-success/15 text-success'
                    : 'bg-subtle text-muted',
              )}
            >
              {done ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
            </span>
            <span className={active ? 'font-medium' : 'text-muted'}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function addressLine(billedTo) {
  return [billedTo?.addressLine, billedTo?.city, billedTo?.state, billedTo?.postalCode]
    .filter(Boolean)
    .join(', ');
}

function BilledTo({ billedTo, canEdit, onEdit }) {
  return (
    <div className="border-line/70 rounded-2xl border px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted text-xs">Invoice billed to</p>
          <p className="truncate font-medium">{billedTo?.companyName || billedTo?.name}</p>
          <p className="text-muted truncate text-xs">
            {addressLine(billedTo) || 'No address added'}
          </p>
          <p className="text-muted truncate text-xs">
            {billedTo?.gstin ? `GSTIN ${billedTo.gstin}` : 'No GSTIN'}
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-accent shrink-0 text-xs font-medium hover:underline"
          >
            Edit
          </button>
        ) : (
          <span className="text-muted shrink-0 text-xs">Workspace owner</span>
        )}
      </div>
    </div>
  );
}

function PaidState({ result, planName, workspaceId, showInvoiceLink, onClose }) {
  return (
    <div className="py-4 text-center">
      <span className="bg-success/10 text-success mx-auto grid h-12 w-12 place-items-center rounded-2xl">
        <CircleCheck className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="font-display mt-4 text-2xl">Payment received</p>
      <p className="text-muted mt-1 text-sm">
        {result.kind === 'reset'
          ? 'Your AI usage limits have been reset. Ask away.'
          : result.kind === 'credits'
            ? `${result.credits?.toLocaleString('en-IN')} AI credits are in your account.`
            : `${planName} is active until ${shortDate(result.periodEnd)}.`}{' '}
        {showInvoiceLink
          ? 'Your invoice is ready and a copy is on its way by email.'
          : 'The invoice has been emailed to the workspace owner.'}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        {showInvoiceLink && (
          <Link
            to={`/w/${workspaceId}/account?tab=billing`}
            className="border-line bg-surface hover:bg-subtle inline-flex h-10 items-center rounded-full border px-5 text-sm font-medium shadow-sm"
          >
            View invoice
          </Link>
        )}
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

// "Have a coupon?" for plans: applied codes re-price the order on the server.
function CouponField({ applied, error, pending, onApply, onRemove }) {
  const [open, setOpen] = useState(Boolean(applied));
  const [value, setValue] = useState(applied ?? '');
  if (applied && !error) {
    return (
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-success inline-flex items-center gap-1.5 font-medium">
          <TicketPercent className="h-4 w-4" aria-hidden="true" />
          {applied} applied
        </span>
        <button
          type="button"
          onClick={() => {
            setValue('');
            onRemove();
          }}
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-xs"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove
        </button>
      </div>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-accent inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
      >
        <TicketPercent className="h-4 w-4" aria-hidden="true" /> Have a coupon?
      </button>
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onApply(value.trim().toUpperCase());
      }}
      className="space-y-1.5"
    >
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase())}
          maxLength={30}
          autoFocus
          placeholder="Coupon code"
          aria-label="Coupon code"
          className="border-line bg-surface h-9 min-w-0 flex-1 rounded-full border px-4 text-sm uppercase"
        />
        <Button type="submit" size="sm" variant="secondary" className="h-9" loading={pending}>
          Apply
        </Button>
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
    </form>
  );
}

function Review({ summary, intervalLabel, canEditDetails, onEditDetails, coupon }) {
  const { discount } = summary;
  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="font-medium">
            {summary.kind === 'reset'
              ? 'AI usage limit reset'
              : summary.kind === 'credits'
                ? `${summary.credits?.toLocaleString('en-IN')} AI credits`
                : `${summary.planName} plan`}
          </p>
          <p className="text-muted text-sm">
            {summary.kind === 'reset'
              ? 'Your 5-hour and weekly limits start over right away'
              : summary.kind === 'credits'
                ? 'One-time pack · never expires'
                : intervalLabel === 'yearly'
                  ? '12 months'
                  : '1 month'}
            {summary.offerCode && (
              <span className="text-accent"> · {summary.offerCode} applied</span>
            )}
          </p>
        </div>
        <p className="tabular-nums">
          {formatInrExact(discount ? summary.listAmount : summary.taxableAmount)}
        </p>
      </div>
      {discount && (
        <div className="text-success -mt-2 flex items-baseline justify-between gap-4 text-sm">
          <span>
            {discount.label}
            {discount.kind === 'coupon' ? ` (${discount.code})` : ''}
          </span>
          <span className="tabular-nums">−{formatInrExact(discount.amount)}</span>
        </div>
      )}
      {coupon}
      <TaxBreakdown
        taxableAmount={summary.taxableAmount}
        tax={summary.tax}
        amount={summary.amount}
        totalLabel="Total due today"
        className="border-line/70 border-t pt-4"
      />
      <BilledTo billedTo={summary.billedTo} canEdit={canEditDetails} onEdit={onEditDetails} />
    </>
  );
}

// Collects the billing address (first purchase), shows the price with GST,
// then takes payment through Razorpay.
export function CheckoutDialog({ workspaceId, selection, onClose }) {
  const open = Boolean(selection);
  const { data: user } = useCurrentUser();
  // A coupon the owner applied (plans only); the quote is re-priced with it.
  const [couponCode, setCouponCode] = useState(null);
  const priced = selection ? { ...selection, ...(couponCode && { couponCode }) } : {};
  const quote = useCheckoutQuote(workspaceId, priced, { enabled: open });
  const couponError = quote.error?.code === 'COUPON_INVALID' ? quote.error.message : null;
  const createCheckout = useCreateCheckout(workspaceId);
  const confirm = useConfirmCheckout(workspaceId);
  // review -> paying (creating the order) -> razorpay (their window is open)
  // -> confirming -> paid
  const [stage, setStage] = useState('review');
  const [editingDetails, setEditingDetails] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const summary = quote.data;
  // Invoices go to the workspace owner; only they can change those details.
  const isOwnerPaying = Boolean(summary && user && summary.billedTo?.email === user.email);
  const needsDetails = isOwnerPaying && !hasBillingAddress(user.billingProfile);
  const showDetails = isOwnerPaying && (editingDetails || needsDetails);

  function close() {
    if (stage !== 'review' && stage !== 'paid') return;
    setStage('review');
    setEditingDetails(false);
    setError(null);
    setResult(null);
    setCouponCode(null);
    onClose();
  }

  async function detailsSaved() {
    setEditingDetails(false);
    // The state decides CGST + SGST or IGST, so price it again.
    await quote.refetch();
  }

  async function pay() {
    setError(null);
    setStage('paying');
    try {
      const checkout = await createCheckout.mutateAsync(priced);
      // Our <dialog> sits in the browser's top layer, above Razorpay's window,
      // so it steps aside while that window is open.
      setStage('razorpay');
      const signed = await openRazorpayCheckout(checkout, { color: ACCENT });
      setStage('confirming');
      try {
        setResult(await confirm.mutateAsync(signed));
        setStage('paid');
      } catch (confirmError) {
        // The money has moved; the webhook will finish activating the plan.
        setError(
          `Your payment went through, but we couldn't confirm it just now (${confirmError.message}). ` +
            (isReset
              ? 'Your limits will reset within a few minutes; refresh this page to check.'
              : isCredits
                ? 'Your credits will be added within a few minutes; refresh this page to check.'
                : 'Your plan will switch on within a few minutes; refresh this page to check.'),
        );
        setStage('review');
      }
    } catch (payError) {
      if (!(payError instanceof CheckoutDismissed)) setError(payError.message);
      setStage('review');
    }
  }

  const busy = stage === 'paying' || stage === 'razorpay' || stage === 'confirming';
  const intervalLabel = selection?.interval === 'yearly' ? 'yearly' : 'monthly';
  const isCredits = Boolean(selection?.packCode);
  const isReset = selection?.product === 'ai-reset';

  return (
    <Dialog
      open={open && stage !== 'razorpay'}
      onClose={close}
      wide={showDetails}
      title={
        stage === 'paid'
          ? 'All set'
          : isReset
            ? 'Reset AI usage limits'
            : isCredits
              ? 'Buy AI credits'
              : `Upgrade to ${summary?.planName ?? 'your new plan'}`
      }
      description={
        stage === 'paid'
          ? undefined
          : isReset
            ? 'Start your 5-hour and weekly limits over now, without waiting.'
            : isCredits
              ? 'Used by the AI assistant across all your workspaces.'
              : `Billed ${intervalLabel}, paid in advance.`
      }
    >
      {stage === 'paid' && result ? (
        <PaidState
          result={result}
          planName={summary?.planName}
          workspaceId={workspaceId}
          showInvoiceLink={isOwnerPaying}
          onClose={close}
        />
      ) : (
        <div className="space-y-4">
          {isOwnerPaying && <Steps current={showDetails ? 'details' : 'review'} />}
          {error && <Alert tone="error">{error}</Alert>}
          {quote.error && !couponError && <Alert tone="error">{quote.error.message}</Alert>}

          {couponError && !summary ? (
            <CouponField
              applied={couponCode}
              error={couponError}
              pending={quote.isFetching}
              onApply={setCouponCode}
              onRemove={() => setCouponCode(null)}
            />
          ) : quote.isPending ? (
            <Skeleton className="h-48" />
          ) : showDetails ? (
            <>
              <p className="text-muted text-sm">
                {needsDetails
                  ? 'Before your first payment, tell us where to address your invoices. We use your state to work out GST.'
                  : 'These details go on this and future invoices.'}
              </p>
              <BillingDetailsForm
                profile={user.billingProfile}
                requireAddress
                submitLabel="Continue to payment"
                onSaved={detailsSaved}
                secondaryAction={
                  <Button type="button" size="sm" variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                }
              />
            </>
          ) : summary ? (
            <Review
              summary={summary}
              intervalLabel={intervalLabel}
              canEditDetails={isOwnerPaying}
              onEditDetails={() => setEditingDetails(true)}
              coupon={
                selection?.planCode && (
                  <CouponField
                    applied={couponCode}
                    error={couponError}
                    pending={quote.isFetching}
                    onApply={setCouponCode}
                    onRemove={() => setCouponCode(null)}
                  />
                )
              }
            />
          ) : null}

          {!showDetails && (
            <DialogActions
              start={
                <span className="text-muted inline-flex items-center gap-1.5 text-xs">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Secured by Razorpay · UPI, cards, netbanking
                </span>
              }
            >
              <Button variant="ghost" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={pay} loading={busy || quote.isFetching} disabled={!summary || busy}>
                {stage === 'confirming'
                  ? 'Confirming…'
                  : `Pay ${summary ? formatInrExact(summary.amount) : ''}`}
              </Button>
            </DialogActions>
          )}
        </div>
      )}
    </Dialog>
  );
}
