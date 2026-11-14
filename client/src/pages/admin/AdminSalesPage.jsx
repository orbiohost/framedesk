import { Download } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import {
  PAYMENT_METHODS,
  PLAN_NAMES,
  methodLabel,
  shortDate,
} from '../../features/admin/adminFormat.js';
import { rangeFromInputs } from '../../features/backups/backupRange.js';
import { paymentsExportUrl, useAdminPayments } from '../../features/admin/hooks.js';
import { formatInr } from '../../lib/format.js';

function useSalesFilters() {
  const [dates, setDates] = useState({ from: '', to: '' });
  const [method, setMethod] = useState('');
  const range = rangeFromInputs(dates.from, dates.to);
  return { dates, setDates, method, setMethod, params: { ...(range ?? {}), method } };
}

export function AdminSalesPage() {
  const { dates, setDates, method, setMethod, params } = useSalesFilters();
  const query = useAdminPayments(params);
  const totals = query.data?.pages[0]?.totals;

  return (
    <>
      <PageHeader
        title="Sales"
        description="Every payment received. Record new ones from Subscriptions or Upgrade requests."
        actions={
          <Button
            variant="secondary"
            onClick={() => window.location.assign(paymentsExportUrl(params))}
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
          </Button>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3 sm:items-end">
        <TextField
          id="sales-from"
          label="From"
          type="date"
          value={dates.from}
          onChange={(event) => setDates({ ...dates, from: event.target.value })}
        />
        <TextField
          id="sales-to"
          label="To"
          type="date"
          value={dates.to}
          onChange={(event) => setDates({ ...dates, to: event.target.value })}
        />
        <SelectField
          id="sales-method"
          label="Method"
          placeholder="All methods"
          options={PAYMENT_METHODS}
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        />
      </div>
      {totals && (
        <p className="mb-4 text-sm">
          <span className="text-2xl font-semibold tabular-nums">{formatInr(totals.amount)}</span>
          <span className="text-muted">
            {' '}
            from {totals.count} {totals.count === 1 ? 'payment' : 'payments'}
            {params.from ? ' in this period' : ''}
          </span>
        </p>
      )}
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.data && (
        <div className="border-line bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-line text-muted border-b text-left text-xs uppercase tracking-[0.1em]">
              <tr>
                <th className="px-4 py-2 font-medium">Paid</th>
                <th className="px-4 py-2 font-medium">Workspace</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Method</th>
                <th className="hidden px-4 py-2 font-medium lg:table-cell">Paid until</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {query.data.items.map((payment) => (
                <tr key={payment.id}>
                  <td className="text-muted px-4 py-2.5">{shortDate(payment.paidAt)}</td>
                  <td className="px-4 py-2.5">
                    <span className="block">{payment.workspace?.name ?? 'Deleted workspace'}</span>
                    <span className="text-muted block text-xs">
                      {payment.kind === 'reset'
                        ? 'AI usage limit reset'
                        : payment.kind === 'credits'
                          ? `${payment.credits?.toLocaleString('en-IN')} AI credits`
                          : `${PLAN_NAMES[payment.planCode]}, ${payment.interval}`}
                      {payment.offerCode && ` · ${payment.offerCode}`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {formatInr(payment.amount)}
                  </td>
                  <td className="text-muted hidden px-4 py-2.5 md:table-cell">
                    {methodLabel(payment.method)}
                    {payment.reference && (
                      <span className="block text-xs">{payment.reference}</span>
                    )}
                  </td>
                  <td className="text-muted hidden px-4 py-2.5 lg:table-cell">
                    {payment.periodEnd ? shortDate(payment.periodEnd) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.data.items.length === 0 && (
            <p className="text-muted p-6 text-center text-sm">No payments in this view yet.</p>
          )}
          {query.hasNextPage && (
            <div className="border-line border-t p-3 text-center">
              <Button
                variant="secondary"
                size="sm"
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
