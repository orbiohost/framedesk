import { format } from 'date-fns';
import { Alert } from '../../components/ui/Alert.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { BILLING_STATUS, compactInr, dateTime, percent } from '../../features/admin/adminFormat.js';
import { BarChart } from '../../features/admin/BarChart.jsx';
import { useAdminDashboard } from '../../features/admin/hooks.js';
import { StatTile } from '../../features/admin/StatTile.jsx';
import { StorageMeter } from '../../features/workspaces/StorageMeter.jsx';
import { formatBytes, formatInr } from '../../lib/format.js';

function KeyNumbers({ metrics }) {
  const { users, subscriptions, revenue } = metrics;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="MRR"
        value={formatInr(subscriptions.mrr)}
        detail={`${formatInr(subscriptions.arr)} a year (ARR)`}
      />
      <StatTile
        label="Revenue this month"
        value={formatInr(revenue.thisMonth)}
        detail={`Last month ${formatInr(revenue.lastMonth)} · all time ${formatInr(revenue.total)}`}
        to="/admin/sales"
      />
      <StatTile
        label="Paying workspaces"
        value={subscriptions.paying}
        detail={`${subscriptions.free ?? 0} on the free plan${subscriptions.trialing ? ` · ${subscriptions.trialing} on an old trial` : ''}`}
        to="/admin/subscriptions"
      />
      <StatTile
        label="Open upgrade requests"
        value={metrics.openUpgradeRequests}
        detail="Waiting for a payment link"
        to="/admin/upgrade-requests"
      />
      <StatTile
        label="Users"
        value={users.total}
        detail={`+${users.new7} this week · +${users.new30} in 30 days`}
        to="/admin/users"
      />
      <StatTile
        label="Active users"
        value={users.active7}
        detail={`Last 7 days · ${users.active30} in 30 days`}
      />
      <StatTile
        label="Churn, 30 days"
        value={percent(subscriptions.churnRate)}
        detail={`${subscriptions.canceled30} cancelled`}
      />
      <StatTile
        label="Workspaces"
        value={subscriptions.totalWorkspaces}
        detail={`${users.suspended} suspended users`}
      />
    </div>
  );
}

function Charts({ metrics }) {
  const revenue = metrics.revenue.byMonth.map((point) => ({
    key: point.month,
    label: format(new Date(`${point.month}-01T00:00:00`), 'MMM yyyy'),
    value: point.amount,
  }));
  const signups = metrics.signups.map((point) => ({
    key: point.day,
    label: format(new Date(`${point.day}T00:00:00`), 'd MMM'),
    value: point.count,
  }));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <BarChart
        title="Revenue by month"
        data={revenue}
        valueLabel="Revenue"
        formatValue={formatInr}
        formatAxis={compactInr}
      />
      <BarChart
        title="Signups per day, last 30 days"
        data={signups}
        valueLabel="Signups"
        formatValue={(value) => String(value)}
      />
    </div>
  );
}

function StorageCard({ metrics }) {
  const { disk, subscriptions } = metrics;
  return (
    <Card>
      <CardHeader title="Storage" description="All workspaces together, stored in Amazon S3." />
      <div className="space-y-5 p-5">
        {disk ? (
          <StorageMeter usedBytes={disk.totalBytes - disk.freeBytes} limitBytes={disk.totalBytes} />
        ) : (
          <p className="text-muted text-sm">
            Files are kept in an S3 bucket, which has no fixed size.
          </p>
        )}
        <p className="text-sm">
          Customer files:{' '}
          <span className="font-medium">{formatBytes(subscriptions.storageUsedBytes)}</span>
          {disk && (
            <span className="text-muted"> · {formatBytes(disk.freeBytes)} free on disk</span>
          )}
        </p>
        <ol className="divide-line divide-y text-sm">
          {subscriptions.topStorage.map((workspace) => (
            <li key={workspace.id} className="flex justify-between gap-3 py-2">
              <span className="truncate">{workspace.name}</span>
              <span className="text-muted shrink-0 tabular-nums">
                {formatBytes(workspace.usedBytes)} of {formatBytes(workspace.limitBytes)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

function StatusCard({ metrics }) {
  return (
    <Card>
      <CardHeader title="Workspaces by plan status" />
      <ul className="divide-line divide-y px-5 text-sm">
        {Object.entries(BILLING_STATUS).map(([status, { label }]) => (
          <li key={status} className="flex justify-between py-2.5">
            <span>{label}</span>
            <span className="tabular-nums">{metrics.subscriptions.byStatus[status] ?? 0}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AdminDashboardPage() {
  const { data: metrics, isPending, isError, error } = useAdminDashboard();

  if (isError) return <Alert tone="error">{error.message}</Alert>;
  if (isPending) return <Skeleton className="h-96 w-full" />;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Updated ${dateTime(metrics.generatedAt)}. Amounts in INR from recorded payments.`}
      />
      <div className="max-w-7xl space-y-6">
        <KeyNumbers metrics={metrics} />
        <Charts metrics={metrics} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <StorageCard metrics={metrics} />
          <StatusCard metrics={metrics} />
        </div>
      </div>
    </>
  );
}
