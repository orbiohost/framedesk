import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { PLAN_NAMES, shortDate } from '../../features/admin/adminFormat.js';
import { useActivateUpgradeRequest, useAdminUpgradeRequests } from '../../features/admin/hooks.js';
import { RecordPaymentDialog } from '../../features/admin/RecordPaymentDialog.jsx';
import { formatInr, formatInrExact } from '../../lib/format.js';

function RequestRow({ request, onActivate }) {
  return (
    <li className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="font-medium">
          {request.workspace?.name ?? 'Deleted workspace'} → {PLAN_NAMES[request.planCode]},{' '}
          {request.interval}
        </p>
        <p className="text-muted text-sm">
          {request.requestedBy?.name} · {request.requestedBy?.email} ·{' '}
          {shortDate(request.createdAt)}
        </p>
        <p className="mt-1 text-sm">
          Collect <strong>{formatInrExact(request.amountDue ?? request.quotedAmount)}</strong>
          {request.amountDue > request.quotedAmount && (
            <span className="text-muted"> ({formatInr(request.quotedAmount)} + GST)</span>
          )}
          {request.offerCode && <span className="text-accent"> · {request.offerCode}</span>}
          {request.discount && (
            <span className="text-success">
              {' '}
              · {request.discount.code} −₹{request.discount.amount.toLocaleString('en-IN')}
            </span>
          )}
        </p>
      </div>
      <Button onClick={() => onActivate(request)}>Mark paid & activate</Button>
    </li>
  );
}

// Interim billing desk until Razorpay: send a payment link, then record the payment here.
export function UpgradeRequestsPage() {
  const { data: requests, isPending, isError, error } = useAdminUpgradeRequests();
  const activate = useActivateUpgradeRequest();
  const [selected, setSelected] = useState(null);

  function submit({ method, reference, amount }) {
    activate.mutate(
      { requestId: selected.id, method, reference, amount },
      { onSuccess: () => setSelected(null) },
    );
  }

  return (
    <>
      <PageHeader
        title="Upgrade requests"
        description="Send each customer a payment link for the amount shown. Once paid, record it here: the plan, storage and limits switch over at once."
      />
      {isError && <Alert tone="error">{error.message}</Alert>}
      {isPending && <Skeleton className="h-40 w-full max-w-4xl" />}
      {requests?.length === 0 && (
        <EmptyState icon={Inbox} title="No open requests" className="max-w-4xl">
          When a workspace owner picks a plan, it shows up here and you get an email.
        </EmptyState>
      )}
      {requests?.length > 0 && (
        <ul className="border-line bg-surface divide-line max-w-4xl divide-y rounded-lg border">
          {requests.map((request) => (
            <RequestRow key={request.id} request={request} onActivate={setSelected} />
          ))}
        </ul>
      )}
      <RecordPaymentDialog
        open={Boolean(selected)}
        title={selected ? `Payment from ${selected.workspace?.name}` : 'Record payment'}
        initial={{
          planCode: selected?.planCode,
          interval: selected?.interval,
          amount: selected?.amountDue ?? selected?.quotedAmount,
        }}
        fixedPlan
        pending={activate.isPending}
        error={activate.error?.message}
        onSubmit={submit}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
