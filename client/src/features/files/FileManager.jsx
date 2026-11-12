import { FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { canEdit, canManage } from '../workspaces/roles.js';
import { ConfirmDialog } from './FileDialogs.jsx';
import { FolderAccessDialog } from './FolderAccessDialog.jsx';
import { FolderDialog } from './FolderDialog.jsx';
import { FolderFilesPane } from './FolderFilesPane.jsx';
import { FolderTree, MobileFolderBar } from './FolderSidebar.jsx';
import { useFileView } from './FileViewToggle.jsx';
import { useDeleteFolder, useFolders } from './hooks.js';
import { TrashPane } from './TrashPane.jsx';

const SHELL =
  'border-line/70 bg-surface/80 shadow-soft overflow-hidden rounded-3xl border backdrop-blur-xl';

// Folders, files and trash for one project, or for the workspace Drive when
// `project` is null. The two never mix: files only move within their own space.
// fill: on desktop, stretch to the bottom of the window instead of stopping at
// a fixed height (for pages where the file manager is the whole page).
export function FileManager({ workspace, project = null, fill = false }) {
  const projectId = project?.id ?? null;
  const { data: folders, isPending, isError, error } = useFolders(workspace.id, projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  // { type: 'create' | 'subfolder' | 'rename' | 'access' | 'delete', folder? }
  const [folderAction, setFolderAction] = useState(null);
  const deleteFolder = useDeleteFolder(workspace.id);
  const [view, setView] = useFileView();
  const editable = canEdit(workspace);
  const manageable = canManage(workspace);
  // Room for the top bar, the page header and the frame's padding.
  const height = fill ? 'lg:min-h-[calc(100dvh-15.5rem)]' : 'lg:min-h-[34rem]';

  if (isPending) {
    return (
      <div className={cn(SHELL, height, 'grid lg:grid-cols-[16.5rem_minmax(0,1fr)]')}>
        <div className="bg-subtle/40 hidden space-y-2 p-4 lg:block">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <div className="space-y-4 p-6">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }
  if (isError) return <Alert tone="error">{error.message}</Alert>;

  // The open folder lives in the URL (?folder=), so it survives reloads and can be shared.
  const requested = searchParams.get('folder');
  const selection =
    requested === 'trash' || folders.some((f) => f.id === requested) ? requested : folders[0]?.id;
  const selectedFolder = folders.find((folder) => folder.id === selection);
  const select = (value) => setSearchParams({ folder: value }, { replace: true });
  const onFolderAction = (type, folder) => setFolderAction({ type, folder });
  const createFolder = () => setFolderAction({ type: 'create' });
  const closeFolderAction = () => {
    setFolderAction(null);
    deleteFolder.reset();
  };

  function confirmDeleteFolder() {
    const doomed = folderAction.folder;
    deleteFolder.mutate(doomed.id, {
      onSuccess: () => {
        closeFolderAction();
        if (selection === doomed.id) {
          select(doomed.parentId ?? folders.find((f) => f.id !== doomed.id)?.id ?? 'trash');
        }
      },
    });
  }

  const dialogState =
    folderAction?.type === 'create'
      ? { mode: 'create' }
      : folderAction?.type === 'subfolder'
        ? { mode: 'create', parent: folderAction.folder }
        : folderAction?.type === 'rename'
          ? { mode: 'rename', folder: folderAction.folder }
          : null;

  // The folder being managed, as the list has it now (its access may just have changed).
  const accessFolder =
    folderAction?.type === 'access'
      ? (folders.find((folder) => folder.id === folderAction.folder.id) ?? null)
      : null;

  return (
    <div className={cn(SHELL, height, 'grid lg:grid-cols-[16.5rem_minmax(0,1fr)]')}>
      <div className="border-line/70 border-b p-3 lg:hidden">
        <MobileFolderBar
          folders={folders}
          selection={selection}
          canEdit={editable}
          onSelect={select}
          onCreateFolder={createFolder}
        />
      </div>
      <aside className="border-line/70 bg-subtle/40 hidden min-w-0 flex-col gap-3 border-r p-4 lg:flex">
        <div className="flex items-center justify-between px-1">
          <p className="text-muted text-[11px] font-semibold uppercase tracking-[0.14em]">
            Folders
          </p>
          {editable && (
            <button
              type="button"
              onClick={createFolder}
              aria-label="New folder"
              title="New folder"
              className="text-muted hover:bg-surface hover:text-ink grid h-7 w-7 place-items-center rounded-lg transition-colors"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <FolderTree
          folders={folders}
          selection={selection}
          canEdit={editable}
          canManage={manageable}
          onSelect={select}
          onFolderAction={onFolderAction}
        />
      </aside>

      <div className="flex min-w-0 flex-col p-4 sm:p-6">
        {selection === 'trash' ? (
          <TrashPane
            workspace={workspace}
            project={project}
            canEdit={editable}
            view={view}
            onViewChange={setView}
          />
        ) : (
          selectedFolder && (
            <FolderFilesPane
              key={selectedFolder.id}
              workspace={workspace}
              project={project}
              folder={selectedFolder}
              folders={folders}
              canEdit={editable}
              canManage={manageable}
              view={view}
              onViewChange={setView}
              onOpenFolder={select}
              onFolderAction={onFolderAction}
            />
          )
        )}
      </div>

      <FolderDialog
        workspaceId={workspace.id}
        projectId={projectId}
        state={dialogState}
        onClose={closeFolderAction}
      />
      <FolderAccessDialog
        workspaceId={workspace.id}
        folder={accessFolder}
        onClose={closeFolderAction}
      />
      <ConfirmDialog
        open={folderAction?.type === 'delete'}
        title={`Delete "${folderAction?.folder?.name ?? ''}"?`}
        confirmLabel="Delete folder"
        pending={deleteFolder.isPending}
        error={deleteFolder.error?.message}
        onConfirm={confirmDeleteFolder}
        onClose={closeFolderAction}
      >
        Only empty folders can be deleted. Move or trash the files inside first.
      </ConfirmDialog>
    </div>
  );
}
