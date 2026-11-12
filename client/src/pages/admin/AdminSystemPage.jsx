import { CircleAlert, CircleCheck } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useAdminSystem } from '../../features/admin/hooks.js';
import { formatBytes } from '../../lib/format.js';

function uptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

// Status always pairs an icon and a word with its colour.
function Health({ ok, children }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <span className={`flex items-center gap-1.5 ${ok ? 'text-success' : 'text-danger'}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </span>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function AdminSystemPage() {
  const { data: system, isPending, isError, error } = useAdminSystem();
  if (isError) return <Alert tone="error">{error.message}</Alert>;
  if (isPending) return <Skeleton className="h-64 w-full max-w-3xl" />;

  return (
    <>
      <PageHeader
        title="System"
        description="Refreshes every 30 seconds. Detailed errors are in the server logs."
      />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Services" />
          <div className="divide-line divide-y px-5">
            <Row label="Database">
              <Health ok={system.database.ok}>
                {system.database.ok
                  ? `Connected · ${system.database.latencyMs} ms`
                  : `Down: ${system.database.error}`}
              </Health>
            </Row>
            <Row label="API server">
              <Health ok>Up {uptime(system.server.uptimeSeconds)}</Health>
            </Row>
            <Row label="Email">
              {system.email.transport === 'smtp' ? 'SMTP' : 'Console (development, not sent)'}
            </Row>
            <Row label="Unfinished uploads">{system.uploads.pending}</Row>
          </div>
        </Card>
        <Card>
          <CardHeader title="Server" />
          <div className="divide-line divide-y px-5">
            <Row label="Environment">{system.server.environment}</Row>
            <Row label="Node.js">{system.server.nodeVersion}</Row>
            <Row label="Memory in use">{formatBytes(system.server.memoryRssBytes)}</Row>
            <Row label="JavaScript heap">{formatBytes(system.server.heapUsedBytes)}</Row>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader
            title="Not set up yet"
            description="Planned parts of the platform that this server doesn't run yet."
          />
          <ul className="text-muted list-disc space-y-1 px-10 py-4 text-sm">
            {system.notConfigured.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
