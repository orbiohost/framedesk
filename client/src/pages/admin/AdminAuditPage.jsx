import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { dateTime } from '../../features/admin/adminFormat.js';
import { useAdminAuditLog } from '../../features/admin/hooks.js';
import { formatInr } from '../../lib/format.js';

const ACTIONS = {
  'payment.record': (d) =>
    `Recorded ${formatInr(d.amount)} (${d.planCode}, ${d.interval}, ${d.method})`,
  'subscription.extend_trial': (d) => `Extended trial by ${d.days} days`,
  'subscription.set_status': (d) => `Set status to ${d.status}`,
  'subscription.change_plan': (d) => `Changed plan to ${d.planCode}`,
  'user.suspend': (d) => `Suspended ${d.email}`,
  'user.restore': (d) => `Restored ${d.email}`,
  'workspace.backup': () => 'Downloaded a backup',
  'workspace.restore': () => 'Restored from a backup',
  'upgrade_request.activate': (d) => `Activated ${d.planCode}`,
};

function describe(entry) {
  const format = ACTIONS[entry.action];
  return format ? format(entry.details ?? {}) : entry.action;
}

export function AdminAuditPage() {
  const query = useAdminAuditLog();

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Admin actions, plus backups and restores made by workspace owners. Newest first."
      />
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      {query.isPending && <Skeleton className="h-64 w-full max-w-5xl" />}
      {query.data && (
        <div className="border-line bg-surface max-w-5xl rounded-lg border">
          <ul className="divide-line divide-y text-sm">
            {query.data.items.map((entry) => (
              <li
                key={entry.id}
                className="grid gap-1 px-5 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:gap-4"
              >
                <span className="text-muted tabular-nums">{dateTime(entry.at)}</span>
                <span>
                  {describe(entry)}
                  {entry.workspace && <span className="text-muted"> · {entry.workspace.name}</span>}
                </span>
                <span className="text-muted">{entry.actor?.name ?? 'Unknown'}</span>
              </li>
            ))}
          </ul>
          {query.data.items.length === 0 && (
            <p className="text-muted p-6 text-center text-sm">Nothing recorded yet.</p>
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
