import { ArrowUpRight, Clock, Download, Eye, LifeBuoy, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { daysUntil, formatInr, formatInrExact } from '../../lib/format.js';
import { BILLING_STATUS, paymentMethodLabel, shortDate } from '../admin/adminFormat.js';
import { BillingDetailsForm } from '../billing/BillingDetailsForm.jsx';
import { useAccountBilling, useInvoicePdf } from '../users/hooks.js';
import { StorageMeter } from '../workspaces/StorageMeter.jsx';
import { InvoiceDialog } from './InvoiceDialog.jsx';
import { SettingsRow, SettingsSection } from './SettingsSection.jsx';

const INTERVAL_SUFFIX = { monthly: '/ month', yearly: '/ year' };

function periodProgress(start, end) {
  if (!start || !end) return null;
  const total = new Date(end) - new Date(start);
  if (total <= 0) return null;
  return Math.min(Math.max((Date.now() - new Date(start)) / total, 0), 1);
}

function PlanSummary({ account, lastPayment }) {
  const status = BILLING_STATUS[account.status] ?? BILLING_STATUS.none;
  const isFree = account.status === 'free' || account.status === 'trialing';
  const isPaid = ['active', 'past_due'].includes(account.status);
  const isPastDue = account.status === 'past_due' && Boolean(account.graceEndsAt);
  const hasEnded = isPastDue || account.status === 'read_only';
  const endsAt = isFree ? null : account.currentPeriodEnd;
  const daysLeft = endsAt ? daysUntil(endsAt) : null;
  // Plans are paid in advance and never renew by themselves.
  const endLabel = hasEnded ? 'Ended on' : 'Paid until';
  const progress = isPaid
    ? periodProgress(lastPayment?.periodStart, account.currentPeriodEnd)
    : null;

  return (
    <div className="grid gap-6 py-6 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted text-xs font-medium">{account.workspaceName}</p>
          {account.sharedWorkspaces > 0 && (
            <span className="text-muted text-xs">
              · shared with {account.sharedWorkspaces} more{' '}
              {account.sharedWorkspaces === 1 ? 'workspace' : 'workspaces'}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display text-3xl">{account.planName ?? 'No plan'}</h3>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {isPaid && account.amount ? (
          <p className="mt-1 text-sm">
            <span className="font-semibold tabular-nums">{formatInr(account.amount)}</span>{' '}
            <span className="text-muted">
              {INTERVAL_SUFFIX[account.interval]}, before GST · no automatic renewal
            </span>
          </p>
        ) : null}
        {isFree && (
          <p className="text-muted mt-1 text-sm">
            Free for as long as you like. Upgrade any time for more storage and AI usage; your
            projects and files carry over.
          </p>
        )}

        {endsAt && (
          <div className="mt-5 max-w-md">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted">
                {endLabel} <span className="text-ink font-medium">{shortDate(endsAt)}</span>
              </span>
              {hasEnded ? (
                <span className="text-danger">
                  {isPastDue
                    ? `Moves to the free plan on ${shortDate(account.graceEndsAt)}`
                    : 'Moving to the free plan'}
                </span>
              ) : (
                <span className={cn('tabular-nums', daysLeft <= 7 ? 'text-danger' : 'text-muted')}>
                  {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                </span>
              )}
            </div>
            {progress !== null && (
              <div className="bg-subtle mt-1.5 h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-ink/80 h-full rounded-full"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to={`/w/${account.workspaceId}/upgrade`}
            className="pill-active inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium hover:opacity-90"
          >
            {isPaid ? 'Change or renew plan' : 'Choose a plan'}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <Link
            to={`/w/${account.workspaceId}/support`}
            className="border-line bg-surface hover:bg-subtle inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium shadow-sm"
          >
            <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
            Billing help
          </Link>
        </div>
      </div>

      <div className="bg-subtle/60 self-start rounded-2xl p-4">
        <StorageMeter
          usedBytes={account.storage.usedBytes}
          limitBytes={account.storage.limitBytes}
        />
        <p className="text-muted mt-2 text-xs">Included with your plan, across all workspaces.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-muted text-xs">{label}</p>
      <p className="font-display mt-0.5 truncate text-xl tabular-nums">{value}</p>
      {hint && <p className="text-muted truncate text-xs">{hint}</p>}
    </div>
  );
}

function BillingStats({ billing }) {
  const last = billing.payments[0];
  // Credit packs buy no time, so "paid until" comes from the newest plan payment.
  const lastPlan = billing.payments.find((payment) => (payment.kind ?? 'plan') === 'plan');
  return (
    <div className="bg-surface border-line/60 shadow-soft divide-line/70 grid grid-cols-1 divide-y rounded-3xl border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Stat
        label="Total paid"
        value={formatInrExact(billing.totals.amount)}
        hint={`${billing.totals.count} ${billing.totals.count === 1 ? 'payment' : 'payments'}`}
      />
      <Stat
        label="Last payment"
        value={last ? formatInrExact(last.amount) : '—'}
        hint={last ? shortDate(last.paidAt) : 'Nothing yet'}
      />
      <Stat
        label="Paid until"
        value={lastPlan ? shortDate(lastPlan.periodEnd) : '—'}
        hint={lastPlan ? `${lastPlan.planName}, ${lastPlan.interval}` : 'No paid period'}
      />
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="text-muted hover:bg-subtle hover:text-ink grid h-8 w-8 place-items-center rounded-full disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function PaymentHistory({ payments, onView }) {
  const pdf = useInvoicePdf();

  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="bg-subtle text-muted grid h-11 w-11 place-items-center rounded-2xl">
          <Receipt className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-medium">No payments yet</p>
        <p className="text-muted mt-1 max-w-sm text-sm">
          Once a plan is paid for, every payment shows up here with an invoice you can view and
          download.
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-6">
      {pdf.error && (
        <Alert tone="error" className="mx-6 mb-3">
          {pdf.error.message}
        </Alert>
      )}
      <div className="text-muted hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_4.5rem] gap-4 px-6 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] md:grid">
        <span>Invoice</span>
        <span>Plan</span>
        <span>Method</span>
        <span className="text-right">Amount</span>
        <span className="sr-only">Actions</span>
      </div>
      <ul className="divide-line/70 border-line/70 divide-y border-t">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className="hover:bg-subtle/40 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-6 py-3.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_4.5rem]"
          >
            <button type="button" onClick={() => onView(payment)} className="min-w-0 text-left">
              <span className="block truncate text-sm font-medium hover:underline">
                {payment.invoiceNumber}
              </span>
              <span className="text-muted block text-xs">{shortDate(payment.paidAt)}</span>
            </button>
            <div className="hidden min-w-0 md:block">
              {payment.kind === 'reset' ? (
                <>
                  <p className="truncate text-sm">AI usage limit reset</p>
                  <p className="text-muted truncate text-xs">One-time</p>
                </>
              ) : payment.kind === 'credits' ? (
                <>
                  <p className="truncate text-sm">
                    {payment.credits?.toLocaleString('en-IN')} AI credits
                  </p>
                  <p className="text-muted truncate text-xs">One-time pack</p>
                </>
              ) : (
                <>
                  <p className="truncate text-sm">
                    {payment.planName}{' '}
                    <span className="text-muted">
                      · {payment.interval === 'yearly' ? 'Yearly' : 'Monthly'}
                    </span>
                  </p>
                  <p className="text-muted truncate text-xs">
                    {shortDate(payment.periodStart)} – {shortDate(payment.periodEnd)}
                  </p>
                </>
              )}
            </div>
            <p className="text-muted hidden truncate text-sm md:block">
              {paymentMethodLabel(payment)}
            </p>
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums">{formatInrExact(payment.amount)}</p>
              <p className="text-success text-xs">Paid{payment.tax ? ' · incl. GST' : ''}</p>
            </div>
            <div className="col-span-2 flex justify-end gap-0.5 md:col-span-1">
              <IconButton label="View invoice" onClick={() => onView(payment)}>
                <Eye className="h-4 w-4" aria-hidden="true" />
              </IconButton>
              <IconButton
                label="Download PDF"
                disabled={pdf.isPending && pdf.variables?.payment.id === payment.id}
                onClick={() => pdf.mutate({ payment, mode: 'download' })}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const REQUEST_STATUS = {
  open: { label: 'Awaiting payment', tone: 'accent' },
  activated: { label: 'Activated', tone: 'success' },
  dismissed: { label: 'Closed', tone: 'muted' },
};

function RequestHistory({ requests }) {
  return (
    <ul className="divide-line/70 -mx-6 divide-y">
      {requests.map((request) => {
        const status = REQUEST_STATUS[request.status];
        return (
          <li key={request.id} className="flex items-center gap-3 px-6 py-3">
            <Clock className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {request.planName}, {request.interval} ·{' '}
                <span className="tabular-nums">{formatInr(request.quotedAmount)}</span>
                {request.offerCode && <span className="text-muted"> ({request.offerCode})</span>}
              </p>
              <p className="text-muted text-xs">
                Requested {shortDate(request.createdAt)} for {request.workspaceName}
              </p>
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

export function BillingSection({ user }) {
  const { data: billing, isPending, error } = useAccountBilling();
  const [viewing, setViewing] = useState(null);

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }
  if (error) return <Alert tone="error">{error.message}</Alert>;

  const openRequests = billing.requests.filter((request) => request.status === 'open');
  const ownsAccount = billing.accounts.length > 0;

  return (
    <div className="space-y-6">
      {openRequests.map((request) => (
        <Alert key={request.id} tone="info">
          Your request for <strong>{request.planName}</strong> ({request.interval},{' '}
          {formatInr(request.quotedAmount)}) was sent on {shortDate(request.createdAt)}. We&apos;ll
          email a payment link to {user.email} and switch your plan on once it&apos;s paid.
        </Alert>
      ))}

      <SettingsSection title="Plan" description="Your subscription and what it includes.">
        {ownsAccount ? (
          billing.accounts.map((account) => (
            <PlanSummary
              key={account.workspaceId}
              account={account}
              lastPayment={billing.payments.find(
                (payment) => payment.workspaceId === account.workspaceId,
              )}
            />
          ))
        ) : (
          <p className="text-muted py-6 text-sm">
            You don&apos;t own a workspace, so there&apos;s nothing billed to you. Plans are paid by
            each workspace&apos;s owner.
          </p>
        )}
      </SettingsSection>

      {ownsAccount && <BillingStats billing={billing} />}

      <SettingsSection
        title="Payment history"
        description="Every payment with its invoice. Download a PDF for your records or accounts team."
      >
        <div className="py-4">
          <PaymentHistory payments={billing.payments} onView={setViewing} />
        </div>
      </SettingsSection>

      {billing.requests.length > 0 && (
        <SettingsSection
          title="Plan requests"
          description="Upgrades you asked for and where they stand."
        >
          <div className="py-2">
            <RequestHistory requests={billing.requests} />
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Billing details">
        <SettingsRow
          label="Invoice address"
          description="Printed under “Billed to” on new invoices. Ones already issued keep the details they were issued with."
        >
          <BillingDetailsForm profile={user.billingProfile} />
        </SettingsRow>
      </SettingsSection>

      <InvoiceDialog
        payment={viewing}
        seller={billing.seller}
        billedTo={billing.billedTo}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
