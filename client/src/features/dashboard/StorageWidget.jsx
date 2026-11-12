import { HardDrive, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { formatBytes } from '../../lib/format.js';
import { useStorageUsage } from '../files/hooks.js';
import { canAdminister } from '../workspaces/roles.js';
import { lookOf, StorageDetailsDialog, UsageBar } from '../workspaces/StorageDetailsDialog.jsx';
import { StorageMeter } from '../workspaces/StorageMeter.jsx';
import { Widget } from './Widget.jsx';

const WARNING_RATIO = 0.9;
const LEGEND_SHOWN = 4;

const pill = 'bg-subtle hover:bg-line/70 inline-block rounded-full px-3 py-1.5 text-xs font-medium';

// The biggest file types, then everything else rolled into one line.
function legendItems(categories) {
  const used = categories.filter((item) => item.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  if (used.length <= LEGEND_SHOWN)
    return used.map((item) => ({ ...item, ...lookOf(item.category) }));
  const top = used.slice(0, LEGEND_SHOWN - 1);
  const rest = used.slice(LEGEND_SHOWN - 1);
  return [
    ...top.map((item) => ({ ...item, ...lookOf(item.category) })),
    {
      category: 'rest',
      label: 'Other',
      bar: 'bg-muted',
      bytes: rest.reduce((sum, item) => sum + item.bytes, 0),
    },
  ];
}

function Breakdown({ usage }) {
  const ratio = usage.limitBytes > 0 ? usage.usedBytes / usage.limitBytes : 0;
  const nearlyFull = ratio >= WARNING_RATIO;
  const free = Math.max(0, usage.limitBytes - usage.usedBytes);
  const legend = legendItems(usage.categories);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-2xl font-semibold tabular-nums">{formatBytes(usage.usedBytes)}</p>
        <p className={cn('text-xs tabular-nums', nearlyFull ? 'text-danger' : 'text-muted')}>
          of {formatBytes(usage.limitBytes)} · {formatBytes(free)} free
        </p>
      </div>
      <div
        role="meter"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={usage.limitBytes}
        aria-valuenow={usage.usedBytes}
        aria-valuetext={`${formatBytes(usage.usedBytes)} of ${formatBytes(usage.limitBytes)} used`}
      >
        <UsageBar
          categories={usage.categories}
          limitBytes={usage.limitBytes}
          usedBytes={usage.usedBytes}
        />
      </div>
      {legend.length === 0 ? (
        <p className="text-muted text-xs">No files uploaded yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {legend.map((item) => (
            <li key={item.category} className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', item.bar)} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="text-muted shrink-0 tabular-nums">{formatBytes(item.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
      {usage.trash.count > 0 && (
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {formatBytes(usage.trash.bytes)} in Trash, not counted
        </p>
      )}
    </div>
  );
}

// How the Drive's space is used, by type of file, with a way into the Drive.
export function StorageWidget({ workspace, className }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const usage = useStorageUsage(workspace.id);
  const base = `/w/${workspace.id}`;

  return (
    <Widget
      icon={HardDrive}
      title="Drive storage"
      className={className}
      actions={
        <Link to={`${base}/drive`} className={pill}>
          Open Drive
        </Link>
      }
    >
      {usage.isSuccess ? (
        <Breakdown usage={usage.data} />
      ) : (
        // The workspace already carries the totals, so show those while the
        // breakdown loads (or if it can't).
        <StorageMeter
          usedBytes={workspace.storage.usedBytes}
          limitBytes={workspace.storage.limitBytes}
        />
      )}
      <p className="text-muted mt-3 text-xs">
        {workspace.storage.shared
          ? `Shared with your account workspace "${workspace.storage.accountWorkspaceName}".`
          : usage.data?.workspaceCount > 1
            ? `Shared by the ${usage.data.workspaceCount} workspaces on this account.`
            : 'Shared by all workspaces on this account.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setDetailsOpen(true)} className={pill}>
          Details
        </button>
        {canAdminister(workspace) && (
          <Link to={`${base}/upgrade`} className={pill}>
            Get more space
          </Link>
        )}
      </div>
      <StorageDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        workspace={workspace}
      />
    </Widget>
  );
}
