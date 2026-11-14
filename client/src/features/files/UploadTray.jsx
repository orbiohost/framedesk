import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { formatBytes } from '../../lib/format.js';
import { refreshAfterFileChange, useUploads } from './hooks.js';
import { invalidateFeatures } from '../../lib/workspaceKeys.js';
import {
  cancelUpload,
  clearFinishedUploads,
  hasActiveUploads,
  pauseUpload,
  resumeUpload,
  setUploadFinishedHandler,
} from './uploadStore.js';

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-muted hover:bg-subtle hover:text-ink rounded p-1"
    >
      {children}
    </button>
  );
}

function UploadRow({ item }) {
  const percent = item.size ? Math.round((item.uploadedBytes / item.size) * 100) : 0;
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className={cn('text-xs', item.status === 'error' ? 'text-danger' : 'text-muted')}>
            {item.status === 'error' && item.error}
            {item.status === 'done' && `Uploaded to ${item.folderName}`}
            {item.status === 'paused' && `Paused · ${percent}%`}
            {item.status === 'uploading' && item.saving && 'Saving…'}
            {item.status === 'uploading' &&
              !item.saving &&
              `${formatBytes(item.uploadedBytes)} of ${formatBytes(item.size)} · ${percent}%`}
          </p>
        </div>
        {item.status === 'uploading' && (
          <IconButton label={`Pause ${item.name}`} onClick={() => pauseUpload(item.id)}>
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        )}
        {item.status === 'paused' && (
          <IconButton label={`Resume ${item.name}`} onClick={() => resumeUpload(item.id)}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        )}
        {item.status === 'error' && (
          <IconButton label={`Retry ${item.name}`} onClick={() => resumeUpload(item.id)}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        )}
        {item.status !== 'done' && (
          <IconButton label={`Cancel ${item.name}`} onClick={() => cancelUpload(item.id)}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {item.status !== 'done' && (
        <div className="bg-subtle mt-2 h-1 overflow-hidden rounded-full" aria-hidden="true">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              item.status === 'error' ? 'bg-danger' : 'bg-ink',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </li>
  );
}

function summary(items) {
  const active = items.filter((item) => item.status === 'uploading' || item.status === 'paused');
  if (active.length === 0)
    return `${items.length} ${items.length === 1 ? 'upload' : 'uploads'} finished`;
  const sent = active.reduce((total, item) => total + item.uploadedBytes, 0);
  const size = active.reduce((total, item) => total + item.size, 0);
  return `Uploading ${active.length} · ${formatBytes(sent)} of ${formatBytes(size)}`;
}

// Mounted once in the app shell, so uploads survive moving between pages.
// raised: sits above the AI assistant button in the corner.
export function UploadTray({ raised = false }) {
  const items = useUploads();
  const queryClient = useQueryClient();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setUploadFinishedHandler((item) => {
      refreshAfterFileChange(queryClient, item.workspaceId);
      // Its transcript was queued on the server; show it in the history.
      if (item.transcribe) invalidateFeatures(queryClient, item.workspaceId, ['transcripts']);
    });
  }, [queryClient]);

  useEffect(() => {
    function warnBeforeLeaving(event) {
      if (hasActiveUploads()) event.preventDefault();
    }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, []);

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Uploads"
      className={cn(
        'border-line bg-surface fixed right-4 z-30 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border shadow-2xl',
        // Below lg it also clears the bottom tab bar.
        raised
          ? 'bottom-[calc(8.5rem+env(safe-area-inset-bottom))] lg:bottom-20'
          : 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-4',
      )}
    >
      <header className="pill-active flex items-center gap-2 px-4 py-2.5">
        <p className="flex-1 truncate text-sm font-medium" aria-live="polite">
          {summary(items)}
        </p>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Show uploads' : 'Hide uploads'}
          className="hover:bg-bg/10 rounded p-1"
        >
          {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </header>
      {!isCollapsed && (
        <>
          <ul className="divide-line max-h-72 divide-y overflow-y-auto">
            {items.map((item) => (
              <UploadRow key={item.id} item={item} />
            ))}
          </ul>
          {items.some((item) => item.status === 'done') && (
            <footer className="border-line border-t px-4 py-2 text-right">
              <button
                type="button"
                onClick={clearFinishedUploads}
                className="text-muted hover:text-ink text-xs"
              >
                Clear finished
              </button>
            </footer>
          )}
        </>
      )}
    </section>
  );
}
