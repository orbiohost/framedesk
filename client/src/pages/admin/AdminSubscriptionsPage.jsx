import { useDeferredValue, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { AdjustSubscriptionDialog } from '../../features/admin/AdjustSubscriptionDialog.jsx';
import {
  BILLING_STATUS,
  BILLING_STATUS_OPTIONS,
  PLAN_NAMES,
  PLAN_OPTIONS,
  shortDate,
} from '../../features/admin/adminFormat.js';
import { useAdminSubscriptions, useRecordPayment } from '../../features/admin/hooks.js';
import { RecordPaymentDialog } from '../../features/admin/RecordPaymentDialog.jsx';
import { formatBytes, formatInr } from '../../lib/format.js';

function renewsOrEnds(billing) {
  if (billing.status === 'trialing') return `Trial ends ${shortDate(billing.trialEndsAt)}`;
  if (billing.currentPeriodEnd) return `Paid until ${shortDate(billing.currentPeriodEnd)}`;
  return '—';
}

function SubscriptionRow({ subscription, onPay, onAdjust }) {
  const { billing } = subscription;
  const status = BILLING_STATUS[billing.status] ?? BILLING_STATUS.none;
  return (
    <tr>
      <td className="px-4 py-3">
        <span className="block font-medium">{subscription.workspaceName}</span>
        <span className="text-muted block">{subscription.owner?.email ?? 'Owner missing'}</span>
      </td>
      <td className="px-4 py-3">
        <span className="block">
          {PLAN_NAMES[billing.planCode] ?? 'No plan'}
          {billing.interval && <span className="text-muted">, {billing.interval}</span>}
        </span>
        <Badge tone={status.tone} className="mt-1">
          {status.label}
        </Badge>
      </td>
      <td className="hidden px-4 py-3 tabular-nums lg:table-cell">
        {billing.amount ? formatInr(billing.amount) : '—'}
        {subscription.monthlyValue > 0 && (
          <span className="text-muted block text-xs">
            {formatInr(subscription.monthlyValue)}/mo
          </span>
        )}
      </td>
      <td className="text-muted hidden px-4 py-3 md:table-cell">{renewsOrEnds(billing)}</td>
      <td className="text-muted hidden px-4 py-3 tabular-nums xl:table-cell">
        {formatBytes(subscription.storage.usedBytes)} /{' '}
        {formatBytes(subscription.storage.limitBytes)}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => onAdjust(subscription)}>
            Adjust
          </Button>
          <Button size="sm" onClick={() => onPay(subscription)}>
            Record payment
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function AdminSubscriptionsPage() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', plan: '' });
  const [paying, setPaying] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const {
    data: subscriptions,
    isPending,
    isError,
    error,
  } = useAdminSubscriptions({ ...filters, q: useDeferredValue(search.trim()) });
  const recordPayment = useRecordPayment();

  function submitPayment(payment) {
    recordPayment.mutate(
      { workspaceId: paying.workspaceId, ...payment },
      { onSuccess: () => setPaying(null) },
    );
  }

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Every workspace's plan. Record renewals and adjust plans here; every change is audit-logged."
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-[12rem_12rem_minmax(0,1fr)] sm:items-end">
        <SelectField
          id="filter-status"
          label="Status"
          placeholder="All statuses"
          options={BILLING_STATUS_OPTIONS}
          value={filters.status}
          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
        />
        <SelectField
          id="filter-plan"
          label="Plan"
          placeholder="All plans"
          options={PLAN_OPTIONS}
          value={filters.plan}
          onChange={(event) => setFilters({ ...filters, plan: event.target.value })}
        />
        <SearchInput
          label="Search subscriptions"
          placeholder="Workspace or owner email"
          value={search}
          onChange={setSearch}
        />
      </div>
      {isError && <Alert tone="error">{error.message}</Alert>}
      {isPending && <Skeleton className="h-64 w-full" />}
      {subscriptions && (
        <div className="border-line bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-line text-muted border-b text-left text-xs uppercase tracking-[0.1em]">
              <tr>
                <th className="px-4 py-2 font-medium">Workspace</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="hidden px-4 py-2 font-medium lg:table-cell">Price</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Renewal</th>
                <th className="hidden px-4 py-2 font-medium xl:table-cell">Storage</th>
                <th className="px-4 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {subscriptions.map((subscription) => (
                <SubscriptionRow
                  key={subscription.workspaceId}
                  subscription={subscription}
                  onPay={setPaying}
                  onAdjust={setAdjusting}
                />
              ))}
            </tbody>
          </table>
          {subscriptions.length === 0 && (
            <p className="text-muted p-6 text-center text-sm">No workspaces match these filters.</p>
          )}
        </div>
      )}
      <RecordPaymentDialog
        open={Boolean(paying)}
        title={paying ? `Record payment · ${paying.workspaceName}` : 'Record payment'}
        initial={{
          planCode: paying?.billing.planCode ?? 'studio',
          interval: paying?.billing.interval ?? 'monthly',
          amount: paying?.billing.amount ?? '',
        }}
        pending={recordPayment.isPending}
        error={recordPayment.error?.message}
        onSubmit={submitPayment}
        onClose={() => setPaying(null)}
      />
      <AdjustSubscriptionDialog subscription={adjusting} onClose={() => setAdjusting(null)} />
    </>
  );
}
