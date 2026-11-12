import { Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { formatBytes } from '../../lib/format.js';
import { ConfirmDialog } from './FileDialogs.jsx';
import { FileGrid } from './FileGrid.jsx';
import { FileTable, countFiles } from './FileTable.jsx';
import { FileViewToggle } from './FileViewToggle.jsx';
import { useEmptyTrash, useFileLifecycle, useFiles } from './hooks.js';

// `project` is null for the workspace Drive's trash.
export function TrashPane({ workspace, project, canEdit, view, onViewChange }) {
  const query = useFiles(workspace.id, { projectId: project?.id ?? null, trashed: true });
  const lifecycle = useFileLifecycle(workspace.id);
  const [fileToDelete, setFileToDelete] = useState(null);
  const emptyTrash = useEmptyTrash(workspace.id);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const loadedCount = countFiles(query);
  const loadedBytes =
    query.data?.pages.reduce(
      (total, page) => total + page.files.reduce((sum, file) => sum + file.size, 0),
      0,
    ) ?? 0;
  // Pages beyond the first aren't loaded, so the exact total isn't known.
  const countLabel = query.hasNextPage
    ? `${loadedCount}+ files`
    : `${loadedCount} file${loadedCount === 1 ? '' : 's'}`;

  function closeEmpty() {
    setConfirmEmpty(false);
    emptyTrash.reset();
  }

  function onAction(action, file) {
    if (action === 'restore') lifecycle.mutate({ id: file.id, action: 'restore' });
    if (action === 'delete') setFileToDelete(file);
  }

  function deleteForever() {
    lifecycle.mutate(
      { id: fileToDelete.id, action: 'delete' },
      { onSuccess: () => setFileToDelete(null) },
    );
  }

  return (
    <section className="min-w-0">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl">Trash</h2>
          <p className="text-muted mt-1 text-sm">
            Files here no longer count toward storage. Restore them to use them again, or delete
            them for good.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {canEdit && loadedCount > 0 && (
            <Button
              variant="danger"
              size="sm"
              className="h-9"
              onClick={() => setConfirmEmpty(true)}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Empty trash
            </Button>
          )}
          <FileViewToggle value={view} onChange={onViewChange} />
        </div>
      </header>

      {lifecycle.error && !fileToDelete && (
        <Alert tone="error" className="mb-3">
          {lifecycle.error.message}
        </Alert>
      )}
      {query.isPending && <Skeleton className="h-40 w-full" />}
      {query.isSuccess && countFiles(query) === 0 && (
        <EmptyState icon={Trash2} title="Trash is empty">
          Files you remove from this {project ? 'project' : 'Drive'} wait here so they can be
          restored.
        </EmptyState>
      )}
      {countFiles(query) > 0 &&
        (view === 'grid' ? (
          <FileGrid
            workspaceId={workspace.id}
            query={query}
            inTrash
            canEdit={canEdit}
            onAction={onAction}
          />
        ) : (
          <FileTable query={query} inTrash canEdit={canEdit} onAction={onAction} />
        ))}

      <ConfirmDialog
        open={Boolean(fileToDelete)}
        title={`Delete "${fileToDelete?.name}" forever?`}
        confirmLabel="Delete forever"
        pending={lifecycle.isPending}
        error={lifecycle.error?.message}
        onConfirm={deleteForever}
        onClose={() => setFileToDelete(null)}
      >
        This frees {fileToDelete ? formatBytes(fileToDelete.size) : ''} of storage and cannot be
        undone.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmEmpty}
        title="Empty the Trash?"
        confirmLabel="Delete everything forever"
        pending={emptyTrash.isPending}
        error={emptyTrash.error?.message}
        onConfirm={() => emptyTrash.mutate(project?.id ?? null, { onSuccess: closeEmpty })}
        onClose={closeEmpty}
      >
        {countLabel} ({formatBytes(loadedBytes)}
        {query.hasNextPage ? ' or more' : ''}) in this {project ? 'project' : 'Drive'}
        &rsquo;s Trash will be deleted for good, with their transcripts. This cannot be undone.
      </ConfirmDialog>
    </section>
  );
}
