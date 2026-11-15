import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  FolderInput,
  FolderPlus,
  Link2,
  Lock,
  Mic,
  Search,
  SearchX,
  Share2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import { ProjectBriefPanel } from '../briefs/ProjectBriefPanel.jsx';
import { ShareFilesDialog } from '../fileShare/ShareFilesDialog.jsx';
import { SharedLinksDialog } from '../fileShare/SharedLinksDialog.jsx';
import { ActionMenu } from './ActionMenu.jsx';
import {
  ConfirmDialog,
  FileDetailsDialog,
  LinkProjectsDialog,
  MoveFileDialog,
  PreviewDialog,
} from './FileDialogs.jsx';
import { VoiceNoteDialog, canRecordVoice } from './VoiceNoteDialog.jsx';
import { useTranscriptionEnabled } from '../transcripts/hooks.js';
import { folderMenuItems } from './folderActions.js';
import {
  FILE_SORTS,
  FILE_TYPE_FILTERS,
  folderPath,
  folderTree,
  matchesType,
  sortFiles,
} from './fileMeta.js';
import { FileGrid, SubfolderTiles } from './FileGrid.jsx';
import { FileTable, allFiles, countFiles, filterFiles } from './FileTable.jsx';
import { FileViewToggle } from './FileViewToggle.jsx';
import {
  fetchFileUrl,
  useBulkFiles,
  useFileLifecycle,
  useFiles,
  warmFilePreview,
} from './hooks.js';
import { addUploads } from './uploadStore.js';

const SORT_KEY = 'files:sort';

// The sort order, remembered in this browser like the list/grid choice.
function useFileSort() {
  const [sort, setSort] = useState(() => {
    const saved = readLocal(SORT_KEY);
    return FILE_SORTS.some((option) => option.value === saved) ? saved : 'newest';
  });
  const change = (next) => {
    setSort(next);
    writeLocal(SORT_KEY, next);
  };
  return [sort, change];
}

function useFileDrop(enabled, onFiles) {
  const [isDragging, setIsDragging] = useState(false);
  const depth = useRef(0);
  if (!enabled) return { isDragging: false, handlers: {} };

  const hasFiles = (event) => event.dataTransfer.types.includes('Files');
  return {
    isDragging,
    handlers: {
      onDragEnter: (event) => {
        if (!hasFiles(event)) return;
        depth.current += 1;
        setIsDragging(true);
      },
      onDragOver: (event) => hasFiles(event) && event.preventDefault(),
      onDragLeave: () => {
        depth.current -= 1;
        if (depth.current <= 0) setIsDragging(false);
      },
      onDrop: (event) => {
        event.preventDefault();
        depth.current = 0;
        setIsDragging(false);
        if (event.dataTransfer.files.length > 0) onFiles([...event.dataTransfer.files]);
      },
    },
  };
}

// Every ancestor is a link back up; the open folder is the heading.
function Breadcrumb({ folders, folder, onOpen }) {
  const path = folderPath(folders, folder.id);
  return (
    <nav aria-label="Folder path" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
        {path.map((part, index) => {
          const isLast = index === path.length - 1;
          return (
            <li key={part.id} className="flex min-w-0 items-center gap-1">
              {isLast ? (
                <h2 className="font-display truncate text-xl sm:text-2xl" aria-current="page">
                  {part.name}
                </h2>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onOpen(part.id)}
                    className="text-muted hover:bg-subtle hover:text-ink truncate rounded-lg px-1.5 py-0.5 text-sm font-medium transition-colors sm:text-base"
                  >
                    {part.name}
                  </button>
                  <ChevronRight className="text-muted/70 h-4 w-4 shrink-0" aria-hidden="true" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SectionLabel({ children, count }) {
  return (
    <h3 className="text-muted mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
      {children}
      {count > 0 && (
        <span className="bg-subtle rounded-full px-1.5 py-px text-[10px] tabular-nums">
          {count}
        </span>
      )}
    </h3>
  );
}

function SearchBox({ value, onChange }) {
  function onKeyDown(event) {
    if (event.key !== 'Escape' || !value) return;
    event.stopPropagation();
    onChange('');
  }
  return (
    <label className="border-line/80 bg-surface focus-within:border-accent/50 focus-within:ring-accent/20 relative flex h-[38px] min-w-[11rem] flex-1 items-center rounded-full border shadow-sm transition-shadow focus-within:ring-4 sm:max-w-xs">
      <Search
        className="text-muted pointer-events-none absolute left-3 h-4 w-4"
        aria-hidden="true"
      />
      <span className="sr-only">Search files in this folder</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search this folder"
        className="placeholder:text-muted/80 h-full w-full min-w-0 rounded-full bg-transparent pl-9 pr-8 text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="text-muted hover:bg-subtle hover:text-ink absolute right-1.5 grid h-6 w-6 place-items-center rounded-full"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

function SortSelect({ value, onChange }) {
  return (
    <label className="border-line/70 bg-surface text-muted focus-within:ring-accent/20 relative flex h-[38px] shrink-0 items-center rounded-full border shadow-sm focus-within:ring-4">
      <ArrowDownUp className="pointer-events-none absolute left-3 h-3.5 w-3.5" aria-hidden="true" />
      <ChevronDown
        className="pointer-events-none absolute right-2.5 h-3.5 w-3.5"
        aria-hidden="true"
      />
      <span className="sr-only">Sort files</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-ink h-full cursor-pointer appearance-none rounded-full bg-transparent pl-8 pr-8 text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
      >
        {FILE_SORTS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// One chip per kind of file present in the folder; a sideways-scrolling row on phones.
function TypeChips({ files, value, onChange }) {
  const options = FILE_TYPE_FILTERS.filter(
    (option) => option.value === 'all' || files.some((file) => matchesType(file, option.value)),
  );
  // Nothing to narrow down when every file is the same kind.
  if (options.length <= 2) return null;
  return (
    <div
      role="group"
      aria-label="Filter by type"
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const count =
          option.value === 'all'
            ? files.length
            : files.filter((file) => matchesType(file, option.value)).length;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
              isActive
                ? 'border-accent/50 bg-accent/15 text-ink font-semibold'
                : 'border-line/80 bg-surface text-muted hover:text-ink',
            )}
          >
            {option.label}
            <span className="text-[11px] tabular-nums opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

// Appears once files are ticked; stays in reach at the bottom of the pane.
function SelectionBar({ count, error, onShare, onMove, onTrash, onClear }) {
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex justify-center">
      <div className="bg-surface border-line shadow-lift flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border p-1.5 pl-4">
        <p className="mr-1 text-sm font-semibold tabular-nums" role="status">
          {count} selected
        </p>
        <Button size="sm" variant="secondary" onClick={onShare}>
          <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Share
        </Button>
        <Button size="sm" variant="secondary" onClick={onMove}>
          <FolderInput className="h-3.5 w-3.5" aria-hidden="true" /> Move
        </Button>
        <Button size="sm" variant="danger" onClick={onTrash}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Trash
        </Button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="text-muted hover:bg-subtle hover:text-ink grid h-8 w-8 place-items-center rounded-full"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        {error && <p className="text-danger w-full px-1 pb-1 text-xs">{error}</p>}
      </div>
    </div>
  );
}

function BulkMoveForm({ folders, currentFolderId, count, pending, error, onMove, onDone }) {
  const [folderId, setFolderId] = useState(currentFolderId);
  const options = folderTree(folders).map((folder) => ({
    value: folder.id,
    label: `${'  '.repeat(folder.depth)}${folder.name}`,
  }));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onMove(folderId);
      }}
      className="space-y-4"
    >
      {error && <Alert tone="error">{error}</Alert>}
      <SelectField
        id="bulk-move-folder"
        label="Move to"
        options={options}
        value={folderId}
        onChange={(event) => setFolderId(event.target.value)}
      />
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} disabled={folderId === currentFolderId}>
          Move {plural(count, 'file')}
        </Button>
      </DialogActions>
    </form>
  );
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// `project` is null in the workspace Drive. view: "list" | "grid".
export function FolderFilesPane({
  workspace,
  project,
  folder,
  folders,
  canEdit,
  canManage = false,
  view,
  onViewChange,
  onOpenFolder,
  onFolderAction,
}) {
  const projectId = project?.id ?? null;
  const inputRef = useRef(null);
  const [dialog, setDialog] = useState(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useFileSort();
  const [picked, setPicked] = useState(() => new Set());
  // "share" | "move" | "trash" while the matching dialog for the selection is open.
  const [bulkDialog, setBulkDialog] = useState(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const canRecord = canEdit && canRecordVoice();
  const query = useFiles(workspace.id, { folderId: folder.id });
  const lifecycle = useFileLifecycle(workspace.id);
  const bulk = useBulkFiles(workspace.id);
  const canTranscribe = useTranscriptionEnabled(workspace.id);
  const location = useLocation();
  const navigate = useNavigate();

  // Arrived from the header search with one file picked: open its preview, or
  // narrow the list to it when it can't be previewed. Then forget the request
  // so a reload or Back doesn't open it again.
  const requestedFile =
    location.state?.openFile?.folderId === folder.id ? location.state.openFile : null;
  const [handledKey, setHandledKey] = useState(null);
  if (requestedFile && location.key !== handledKey) {
    setHandledKey(location.key);
    if (requestedFile.previewable) setDialog({ type: 'preview', file: requestedFile });
    else setSearch(requestedFile.name);
  }
  useEffect(() => {
    if (requestedFile) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [requestedFile, navigate, location.pathname, location.search]);

  function upload(files) {
    addUploads({
      workspaceId: workspace.id,
      projectId,
      folderId: folder.id,
      folderName: folder.name,
      files,
    });
  }

  const drop = useFileDrop(canEdit, upload);

  async function onAction(action, file) {
    if (action === 'open')
      return file.previewable ? setDialog({ type: 'preview', file }) : onAction('download', file);
    if (action === 'transcribe') return setDialog({ type: 'preview', file, transcript: true });
    if (action === 'download')
      return window.location.assign(await fetchFileUrl(workspace.id, file.id, 'attachment'));
    if (action === 'trash') return lifecycle.mutate({ id: file.id, action: 'trash' });
    setDialog({ type: action, file });
  }

  const closeDialog = () => setDialog(null);
  const isBriefsFolder = Boolean(projectId) && folder.kind === 'briefs';
  // A file the AI brief cites: open it here, or go to the subfolder it is in.
  function openBriefSource(source) {
    const file = allFiles(query).find((candidate) => candidate.id === source.id);
    if (file) return onAction('open', file);
    if (source.folderId !== folder.id) onOpenFolder(source.folderId);
  }
  const fileCount = countFiles(query);
  const loaded = allFiles(query);
  // A type chip only counts while files of that kind are still here.
  const activeType = loaded.some((file) => matchesType(file, type)) ? type : 'all';
  const shownFiles = sortFiles(
    filterFiles(
      loaded.filter((file) => matchesType(file, activeType)),
      search,
    ),
    sort,
  );
  const isSearching = search.trim() !== '';
  const isNarrowed = isSearching || activeType !== 'all';

  // Only files still on screen stay selected (a search or a move can drop some).
  const selectedIds = shownFiles.filter((file) => picked.has(file.id)).map((file) => file.id);
  const allSelected = shownFiles.length > 0 && selectedIds.length === shownFiles.length;
  const selection = canEdit
    ? {
        ids: new Set(selectedIds),
        allSelected,
        toggle: (file) =>
          setPicked((current) => {
            const next = new Set(current);
            if (next.has(file.id)) next.delete(file.id);
            else next.add(file.id);
            return next;
          }),
        toggleAll: () =>
          setPicked(allSelected ? new Set() : new Set(shownFiles.map((file) => file.id))),
      }
    : undefined;
  const clearSelection = () => setPicked(new Set());
  const closeBulkDialog = () => {
    setBulkDialog(null);
    bulk.reset();
  };

  function runBulk(input) {
    bulk.mutate(
      { ids: selectedIds, ...input },
      {
        onSuccess: () => {
          clearSelection();
          setBulkDialog(null);
        },
      },
    );
  }
  // One file from its menu, or everything ticked from the selection bar.
  let filesToShare = null;
  if (dialog?.type === 'share') filesToShare = [dialog.file];
  else if (bulkDialog === 'share')
    filesToShare = shownFiles.filter((file) => selectedIds.includes(file.id));
  // Previous/next in the preview step through what is on screen.
  const previewable = shownFiles.filter((file) => file.previewable);
  const subfolders = folders.filter((candidate) => candidate.parentId === folder.id);
  const warm = (file) => warmFilePreview(workspace.id, file);

  let summary = '';
  if (query.isSuccess) {
    summary = isNarrowed
      ? `${shownFiles.length} of ${plural(fileCount, 'file')}`
      : `${fileCount}${query.hasNextPage ? '+' : ''} file${fileCount === 1 ? '' : 's'}` +
        (subfolders.length ? ` · ${plural(subfolders.length, 'folder')}` : '');
  }

  return (
    <section {...drop.handlers} data-context-menu className="relative flex min-w-0 flex-1 flex-col">
      <header className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <Breadcrumb folders={folders} folder={folder} onOpen={onOpenFolder} />
            {folder.locked && (
              <button
                type="button"
                disabled={!canManage}
                onClick={() => onFolderAction('access', folder)}
                title={
                  canManage
                    ? 'Manage who can open this folder'
                    : 'Only some people can open this folder'
                }
                className="border-line text-muted enabled:hover:text-ink enabled:hover:bg-subtle inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors"
              >
                <Lock className="h-3 w-3" aria-hidden="true" />
                Restricted
              </button>
            )}
          </div>
          {canEdit && (
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                className="hidden h-9 sm:inline-flex"
                onClick={() => onFolderAction('subfolder', folder)}
              >
                <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" /> Subfolder
              </Button>
              {canRecord && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9"
                  onClick={() => setRecording(true)}
                  title="Record a voice note"
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Record</span>
                  <span className="sr-only sm:hidden">Record a voice note</span>
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="h-9"
                onClick={() => setLinksOpen(true)}
                title="Shared file links"
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden xl:inline">Shared links</span>
                <span className="sr-only xl:hidden">Shared file links</span>
              </Button>
              <Button size="sm" className="h-9" onClick={() => inputRef.current.click()}>
                <UploadCloud className="h-4 w-4" aria-hidden="true" /> Upload
              </Button>
              <ActionMenu
                label={`Actions for folder ${folder.name}`}
                title={folder.name}
                items={folderMenuItems({
                  folder,
                  canEdit,
                  canManage,
                  onAction: onFolderAction,
                })}
                variant="toolbar"
              />
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  upload([...event.target.files]);
                  event.target.value = '';
                }}
              />
            </div>
          )}
        </div>
        {/* Search, sort and view only mean something once there are files. */}
        {fileCount > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <SearchBox value={search} onChange={setSearch} />
            <p className="text-muted hidden text-xs tabular-nums md:block">{summary}</p>
            <div className="ml-auto flex items-center gap-1.5">
              <SortSelect value={sort} onChange={setSort} />
              <FileViewToggle value={view} onChange={onViewChange} />
            </div>
          </div>
        )}
        <TypeChips files={loaded} value={activeType} onChange={setType} />
      </header>

      {isBriefsFolder && (
        <ProjectBriefPanel
          workspaceId={workspace.id}
          projectId={projectId}
          canEdit={canEdit}
          onOpenFile={openBriefSource}
        />
      )}

      {lifecycle.error && (
        <Alert tone="error" className="mb-3">
          {lifecycle.error.message}
        </Alert>
      )}
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      {subfolders.length > 0 && !isNarrowed && (
        <div className="mb-6">
          {fileCount > 0 && <SectionLabel count={subfolders.length}>Folders</SectionLabel>}
          <SubfolderTiles
            folders={subfolders}
            canEdit={canEdit}
            canManage={canManage}
            onOpen={onOpenFolder}
            onFolderAction={onFolderAction}
          />
        </div>
      )}
      {query.isPending && <Skeleton className="h-48 w-full" />}

      {query.isSuccess && fileCount === 0 && (
        <EmptyState
          icon={UploadCloud}
          title={canEdit ? 'Drop files here' : 'This folder is empty'}
          // Fills what is left of the pane, so a tall window isn't half empty.
          className="flex-1 justify-center"
          action={
            canEdit && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => inputRef.current.click()}>Choose files</Button>
                {canRecord && (
                  <Button variant="secondary" onClick={() => setRecording(true)}>
                    <Mic className="h-4 w-4" aria-hidden="true" /> Record a voice note
                  </Button>
                )}
              </div>
            )
          }
        >
          {canEdit &&
            (isBriefsFolder
              ? 'Handwritten notes (photos or scans), voice notes, meeting recordings, PDFs.'
              : projectId
                ? 'Camera rushes, project files, exports, references.'
                : 'Contracts, brand kits, templates, anything not tied to one project.') +
              ' Big uploads keep going in the background and pick up where they stopped if the connection drops.'}
        </EmptyState>
      )}
      {fileCount > 0 && isSearching && shownFiles.length === 0 && (
        <EmptyState icon={SearchX} title="No matches">
          Nothing in {folder.name} has &ldquo;{search.trim()}&rdquo; in its name
          {query.hasNextPage ? ' among the files loaded so far' : ''}.
        </EmptyState>
      )}
      {shownFiles.length > 0 && (
        <>
          {subfolders.length > 0 && !isNarrowed && (
            <SectionLabel count={fileCount}>Files</SectionLabel>
          )}
          {view === 'grid' ? (
            <FileGrid
              workspaceId={workspace.id}
              query={query}
              files={shownFiles}
              canEdit={canEdit}
              canTranscribe={canTranscribe}
              onAction={onAction}
              onWarm={warm}
              selection={selection}
            />
          ) : (
            <FileTable
              query={query}
              files={shownFiles}
              canEdit={canEdit}
              canTranscribe={canTranscribe}
              onAction={onAction}
              onWarm={warm}
              selection={selection}
              sort={sort}
              onSort={setSort}
            />
          )}
        </>
      )}
      {selectedIds.length > 0 && (
        <SelectionBar
          count={selectedIds.length}
          onShare={() => setBulkDialog('share')}
          onMove={() => setBulkDialog('move')}
          onTrash={() => setBulkDialog('trash')}
          onClear={clearSelection}
        />
      )}

      {drop.isDragging && (
        <div className="border-accent bg-accent/10 pointer-events-none absolute -inset-2 z-20 grid place-items-center rounded-2xl border-2 border-dashed backdrop-blur-[2px]">
          <div className="bg-surface shadow-lift flex items-center gap-3 rounded-2xl px-5 py-3">
            <span className="bg-accent text-accent-ink grid h-9 w-9 place-items-center rounded-full">
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold">Drop to upload to {folder.name}</p>
          </div>
        </div>
      )}

      <PreviewDialog
        workspaceId={workspace.id}
        file={dialog?.type === 'preview' ? dialog.file : null}
        files={previewable}
        canEdit={canEdit}
        openTranscript={dialog?.type === 'preview' && Boolean(dialog.transcript)}
        onNavigate={(file) => {
          warm(file);
          setDialog({ type: 'preview', file });
        }}
        onDownload={(file) => onAction('download', file)}
        onClose={closeDialog}
      />
      <FileDetailsDialog
        workspaceId={workspace.id}
        file={dialog?.type === 'rename' ? dialog.file : null}
        onClose={closeDialog}
      />
      <LinkProjectsDialog
        workspaceId={workspace.id}
        file={dialog?.type === 'link' ? dialog.file : null}
        onClose={closeDialog}
      />
      <VoiceNoteDialog
        open={recording}
        workspaceId={workspace.id}
        projectId={projectId}
        folder={folder}
        onClose={() => setRecording(false)}
      />
      <MoveFileDialog
        workspaceId={workspace.id}
        file={dialog?.type === 'move' ? dialog.file : null}
        folders={folders}
        onClose={closeDialog}
      />
      <ShareFilesDialog
        workspaceId={workspace.id}
        files={filesToShare}
        onClose={dialog?.type === 'share' ? closeDialog : closeBulkDialog}
      />
      <SharedLinksDialog
        workspaceId={workspace.id}
        open={linksOpen}
        onClose={() => setLinksOpen(false)}
      />
      <Dialog
        open={bulkDialog === 'move'}
        onClose={closeBulkDialog}
        title={`Move ${plural(selectedIds.length, 'file')}`}
      >
        <BulkMoveForm
          folders={folders}
          currentFolderId={folder.id}
          count={selectedIds.length}
          pending={bulk.isPending}
          error={bulk.error?.message}
          onMove={(folderId) => runBulk({ action: 'move', folderId })}
          onDone={closeBulkDialog}
        />
      </Dialog>
      <ConfirmDialog
        open={bulkDialog === 'trash'}
        title={`Move ${plural(selectedIds.length, 'file')} to Trash?`}
        confirmLabel="Move to Trash"
        pending={bulk.isPending}
        error={bulk.error?.message}
        onConfirm={() => runBulk({ action: 'trash' })}
        onClose={closeBulkDialog}
      >
        They stop counting toward storage and can be restored from the Trash.
      </ConfirmDialog>
    </section>
  );
}
