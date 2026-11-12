import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { formatBytes } from '../../lib/format.js';
import { FileTypeIcon } from '../files/FileTypeIcon.jsx';
import { useStorageUsage } from '../files/hooks.js';
import { canAdminister } from './roles.js';
import { StorageMeter } from './StorageMeter.jsx';

const CATEGORY_LOOK = {
  video: { label: 'Videos', bar: 'bg-accent' },
  image: { label: 'Images', bar: 'bg-pink' },
  audio: { label: 'Audio', bar: 'bg-lavender' },
  document: { label: 'Documents', bar: 'bg-peach' },
  project: { label: 'Project files', bar: 'bg-mint' },
  archive: { label: 'Archives', bar: 'bg-warning' },
};

function lookOf(category) {
  return CATEGORY_LOOK[category] ?? { label: 'Other', bar: 'bg-muted' };
}

function percentOf(bytes, total) {
  if (!total || !bytes) return '0%';
  const percent = (bytes / total) * 100;
  return percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}

function filesLabel(count) {
  return `${count} ${count === 1 ? 'file' : 'files'}`;
}

// One bar for the whole allowance, split into a coloured part per file type.
function UsageBar({ categories, limitBytes, usedBytes }) {
  // Over the limit (or no plan yet), the bar is scaled to what is used instead.
  const scale = Math.max(limitBytes, usedBytes, 1);
  return (
    <div className="bg-subtle flex h-3 gap-px overflow-hidden rounded-full" aria-hidden="true">
      {categories
        .filter((item) => item.bytes > 0)
        .map((item) => (
          <div
            key={item.category}
            className={cn('h-full', lookOf(item.category).bar)}
            style={{ width: `${Math.max((item.bytes / scale) * 100, 0.75)}%` }}
            title={`${lookOf(item.category).label}: ${formatBytes(item.bytes)}`}
          />
        ))}
    </div>
  );
}

function UsageDetails({ usage, workspace }) {
  const used = usage.categories.filter((item) => item.count > 0);
  const totalFiles = used.reduce((sum, item) => sum + item.count, 0);
  const free = Math.max(0, usage.limitBytes - usage.usedBytes);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-semibold tabular-nums">{formatBytes(usage.usedBytes)}</p>
          <p className="text-muted text-sm tabular-nums">
            of {formatBytes(usage.limitBytes)} · {formatBytes(free)} free
          </p>
        </div>
        <UsageBar
          categories={usage.categories}
          limitBytes={usage.limitBytes}
          usedBytes={usage.usedBytes}
        />
        <p className="text-muted text-xs">
          {filesLabel(totalFiles)}
          {usage.workspaceCount > 1 && ` across ${usage.workspaceCount} workspaces on this account`}
        </p>
      </div>

      {used.length === 0 ? (
        <p className="text-muted text-sm">No files uploaded yet.</p>
      ) : (
        <ul className="divide-line/70 divide-y">
          {used.map((item) => {
            const look = lookOf(item.category);
            return (
              <li key={item.category} className="flex items-center gap-3 py-2.5">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', look.bar)} />
                <FileTypeIcon category={item.category} className="text-muted h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{look.label}</p>
                  <p className="text-muted text-xs">{filesLabel(item.count)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">{formatBytes(item.bytes)}</p>
                  <p className="text-muted text-xs tabular-nums">
                    {percentOf(item.bytes, usage.usedBytes)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {usage.trash.count > 0 && (
        <div className="bg-subtle flex items-center gap-3 rounded-2xl px-4 py-3">
          <Trash2 className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-sm">
            {filesLabel(usage.trash.count)} in Trash ({formatBytes(usage.trash.bytes)}). Trash does
            not count toward your storage.
          </p>
        </div>
      )}

      {canAdminister(workspace) && (
        <Link
          to={`/w/${workspace.id}/upgrade`}
          className="bg-subtle hover:bg-line/70 inline-block rounded-full px-3 py-1.5 text-xs font-medium"
        >
          Get more space
        </Link>
      )}
    </div>
  );
}

export function StorageDetailsDialog({ open, onClose, workspace }) {
  const usage = useStorageUsage(workspace.id, { enabled: open });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Storage"
      description="How your space is used, by type of file."
    >
      {usage.isPending ? (
        <div className="space-y-3">
          <StorageMeter
            usedBytes={workspace.storage.usedBytes}
            limitBytes={workspace.storage.limitBytes}
          />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : usage.isError ? (
        <Alert tone="error">Storage details could not be loaded. Please try again.</Alert>
      ) : (
        <UsageDetails usage={usage.data} workspace={workspace} />
      )}
    </Dialog>
  );
}
