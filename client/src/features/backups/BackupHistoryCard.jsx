import { format } from 'date-fns';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { describeRange } from './backupRange.js';
import { useBackupHistory } from './hooks.js';

function restoredCount(details) {
  return Object.values(details?.collections ?? {}).reduce(
    (total, result) => total + result.restored,
    0,
  );
}

function describe(entry) {
  if (entry.type === 'backup') {
    const files = entry.details?.includesFiles ? 'with files' : 'data only';
    return `Backup of ${describeRange(entry.details?.range)}, ${files}`;
  }
  const count = restoredCount(entry.details);
  return `Restore: ${count} ${count === 1 ? 'item' : 'items'} brought back`;
}

export function BackupHistoryCard({ workspace }) {
  const { data: entries, isPending } = useBackupHistory(workspace.id);

  return (
    <Card>
      <CardHeader title="History" />
      {isPending && <Skeleton className="m-5 h-16" />}
      {entries?.length === 0 && (
        <p className="text-muted px-5 py-6 text-sm">
          No backups yet. Download your first one above.
        </p>
      )}
      <ul className="divide-line divide-y">
        {entries?.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3 text-sm"
          >
            <span>{describe(entry)}</span>
            <span className="text-muted">
              {entry.by} · {format(new Date(entry.at), 'd MMM yyyy, h:mm a')}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
