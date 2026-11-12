import { Folder, Lock } from 'lucide-react';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import { formatDate } from '../../lib/dates.js';
import { formatBytes } from '../../lib/format.js';
import { ActionMenu } from './ActionMenu.jsx';
import { folderMenuItems } from './folderActions.js';
import { fileMenuItems, handleFileShortcut } from './fileActions.js';
import { fileStatus } from './fileMeta.js';
import { FileMarks, useWarmHandlers } from './FileRow.jsx';
import { FileThumbnail } from './FileThumbnail.jsx';
import { FileTypeIcon } from './FileTypeIcon.jsx';

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4 2xl:grid-cols-5';

function FileCard({
  workspaceId,
  file,
  inTrash,
  canEdit,
  canTranscribe,
  onAction,
  onWarm,
  selection,
}) {
  const selected = selection?.ids.has(file.id) ?? false;
  const status = fileStatus(file.status);
  const warmHandlers = useWarmHandlers(file, onWarm, !inTrash);
  const items = fileMenuItems({ file, inTrash, canEdit, canTranscribe, onAction });
  const body = (
    <>
      <div className="relative overflow-hidden rounded-xl">
        <FileThumbnail
          workspaceId={workspaceId}
          file={file}
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {status.value !== 'raw' && (
          <Badge
            tone={status.tone}
            className="bg-surface/90 absolute bottom-2 left-2 backdrop-blur"
          >
            {status.label}
          </Badge>
        )}
      </div>
      <div className="flex min-w-0 items-start gap-2 px-1.5 pb-1 pt-2.5">
        <FileTypeIcon category={file.category} className="text-muted mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={file.name}>
            {file.name}
          </p>
          <p className="text-muted truncate text-xs tabular-nums">
            {formatBytes(file.size)} · {formatDate(inTrash ? file.deletedAt : file.createdAt)}
          </p>
          <FileMarks file={file} className="mt-1" />
        </div>
      </div>
    </>
  );

  return (
    <li
      className={cn(
        'border-line/80 bg-surface group relative rounded-2xl border p-2 transition-all duration-200',
        'hover:border-accent/30 hover:shadow-lift focus-within:ring-accent/40 focus-within:ring-2 hover:-translate-y-0.5',
        inTrash && 'opacity-90',
        selected && 'border-accent/60 bg-accent/10',
      )}
      {...warmHandlers}
    >
      {selection && (
        // Always there on touch screens; with a mouse it shows on hover, and
        // stays once anything is selected.
        <label
          className={cn(
            'bg-surface/90 ring-line/60 absolute left-3 top-3 z-10 grid h-8 w-8 cursor-pointer place-items-center rounded-full shadow-sm ring-1 backdrop-blur transition-opacity',
            selection.ids.size === 0 &&
              '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100',
          )}
        >
          <input
            type="checkbox"
            aria-label={`Select ${file.name}`}
            checked={selected}
            onChange={() => selection.toggle(file)}
            className="accent-accent h-4 w-4"
          />
        </label>
      )}
      {inTrash ? (
        <div>{body}</div>
      ) : (
        <button
          type="button"
          // Enter and click both "open"; the click comes from the button itself.
          onClick={() => onAction('open', file)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') handleFileShortcut(event, { file, canEdit, onAction });
          }}
          aria-label={`${file.previewable ? 'Preview' : 'Download'} ${file.name}`}
          className="block w-full rounded-[inherit] text-left focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          {body}
        </button>
      )}
      <div className="absolute right-3 top-3 z-10">
        <ActionMenu
          label={`Actions for ${file.name}`}
          title={file.name}
          items={items}
          variant="overlay"
          revealOnHover
        />
      </div>
    </li>
  );
}

// Same contract as FileTable, with thumbnails. `files` overrides the query's
// list (used for search, filters and sorting); the query still drives "Load more".
export function FileGrid({
  workspaceId,
  query,
  files,
  inTrash = false,
  canEdit,
  canTranscribe,
  onAction,
  onWarm,
  selection,
}) {
  const shown = files ?? query.data?.pages.flatMap((page) => page.files) ?? [];
  return (
    <div>
      <ul className={GRID} aria-label="Files">
        {shown.map((file) => (
          <FileCard
            key={file.id}
            workspaceId={workspaceId}
            file={file}
            inTrash={inTrash}
            canEdit={canEdit}
            canTranscribe={canTranscribe}
            onAction={onAction}
            onWarm={onWarm}
            selection={selection}
          />
        ))}
      </ul>
      {query.hasNextPage && (
        <div className="mt-5 text-center">
          <Button
            variant="secondary"
            size="sm"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            Load more files
          </Button>
        </div>
      )}
    </div>
  );
}

// The open folder's subfolders, as tiles above its files (in both views).
// onFolderAction(action, folder): see folderMenuItems.
export function SubfolderTiles({ folders, canEdit, canManage, onOpen, onFolderAction }) {
  return (
    <ul className={GRID} aria-label="Folders">
      {folders.map((folder) => (
        <li
          key={folder.id}
          className="border-line/80 bg-surface hover:border-accent/30 hover:shadow-soft focus-within:ring-accent/40 group relative flex items-center rounded-2xl border transition-all duration-200 focus-within:ring-2 hover:-translate-y-0.5"
        >
          <button
            type="button"
            onClick={() => onOpen(folder.id)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-[inherit] p-2.5 text-left focus-visible:ring-0 focus-visible:ring-offset-0"
          >
            <span className="bg-lavender/60 text-accent grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105">
              <Folder className="h-5 w-5" fill="currentColor" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="truncate">{folder.name}</span>
                {folder.locked && (
                  <Lock
                    className="text-muted h-3 w-3 shrink-0"
                    aria-label="Restricted to some people"
                  />
                )}
              </span>
              <span className="text-muted block text-xs tabular-nums">
                {folder.fileCount > 0
                  ? `${folder.fileCount} file${folder.fileCount === 1 ? '' : 's'}`
                  : 'Empty'}
              </span>
            </span>
          </button>
          <ActionMenu
            label={`Actions for folder ${folder.name}`}
            title={folder.name}
            items={folderMenuItems({
              folder,
              canEdit,
              canManage,
              onOpen,
              onAction: onFolderAction,
            })}
            revealOnHover
            className="mr-1.5"
          />
        </li>
      ))}
    </ul>
  );
}
