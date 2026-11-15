import {
  ChevronRight,
  ChevronsUpDown,
  Folder,
  FolderOpen,
  FolderPlus,
  Lock,
  NotebookPen,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { ActionMenu } from './ActionMenu.jsx';
import { folderMenuItems } from './folderActions.js';
import { ancestorIds, folderTree } from './fileMeta.js';

// One row of the tree. `roomy` is the phone sheet: taller rows, no hover menus.
function TreeItem({
  isActive,
  depth = 0,
  onClick,
  icon: Icon,
  label,
  count,
  tone,
  // The Notes & Briefs folder: tinted even when not open, so it stands out.
  featured = false,
  locked,
  menuItems,
  roomy,
  // undefined: no children. Otherwise whether the children are showing.
  expanded,
  onToggle,
}) {
  const hasMenu = !roomy && menuItems?.length > 0;
  return (
    <div
      style={{ paddingLeft: `${depth * (roomy ? 1.25 : 0.875)}rem` }}
      className="group relative flex items-center"
    >
      {expanded === undefined ? (
        <span className="w-6 shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
          className={cn(
            'text-muted hover:bg-surface hover:text-ink grid w-6 shrink-0 place-items-center rounded-lg transition-colors',
            roomy ? 'h-11' : 'h-8',
          )}
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
            aria-hidden="true"
          />
        </button>
      )}
      <div
        className={cn(
          'relative flex min-w-0 flex-1 items-center rounded-xl transition-colors',
          isActive
            ? tone === 'danger'
              ? 'bg-danger/10 text-ink ring-danger/25 ring-1'
              : 'bg-accent/15 text-ink ring-accent/30 ring-1'
            : featured
              ? 'bg-accent/[0.07] text-ink ring-accent/20 hover:bg-accent/15 ring-1'
              : 'text-muted hover:bg-surface/80 hover:text-ink',
        )}
      >
        {/* The bar marks the open folder even where the tint is faint. */}
        {isActive && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-y-2 left-0 w-[3px] rounded-full',
              tone === 'danger' ? 'bg-danger' : 'bg-accent',
            )}
          />
        )}
        <button
          type="button"
          onClick={onClick}
          aria-current={isActive ? 'true' : undefined}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 rounded-[inherit] pl-3 text-left text-sm',
            roomy ? 'min-h-11 py-2.5 text-[15px]' : 'py-2',
            hasMenu ? 'pr-1' : 'pr-2.5',
            isActive && 'font-semibold',
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4 shrink-0',
              (isActive || featured) && (tone === 'danger' ? 'text-danger' : 'text-accent'),
            )}
            fill={tone !== 'danger' && isActive ? 'currentColor' : 'none'}
            fillOpacity={0.2}
            aria-hidden="true"
          />
          <span className={cn('min-w-0 flex-1 truncate', featured && 'font-medium')}>{label}</span>
          {featured && (
            <span className="bg-accent text-accent-ink rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
              AI
            </span>
          )}
          {locked && (
            <Lock className="text-muted h-3 w-3 shrink-0" aria-label="Restricted to some people" />
          )}
          {count > 0 && (
            <span
              className={cn(
                'rounded-full px-1.5 text-[11px] font-medium tabular-nums',
                isActive ? 'bg-accent/15 text-accent' : 'bg-subtle text-muted',
                // Makes room for the "⋯" button where it appears on hover.
                hasMenu &&
                  '[@media(hover:hover)]:group-focus-within:hidden [@media(hover:hover)]:group-hover:hidden',
              )}
            >
              {count}
            </span>
          )}
        </button>
        {hasMenu && (
          <ActionMenu
            label={`Actions for folder ${label}`}
            title={label}
            items={menuItems}
            revealOnHover
            className="mr-1 h-7 w-7"
          />
        )}
      </div>
    </div>
  );
}

// The folders as a collapsible tree, then Trash. `selection` is a folder id or
// "trash". onFolderAction(action, folder): see folderMenuItems.
export function FolderTree({
  folders,
  selection,
  canEdit,
  canManage,
  onSelect,
  onFolderAction,
  roomy = false,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const parents = new Set(folders.map((folder) => folder.parentId).filter(Boolean));
  // The open folder is always in view: its ancestors never count as collapsed.
  const forcedOpen = new Set(ancestorIds(folders, selection));
  const isCollapsed = (id) => collapsed.has(id) && !forcedOpen.has(id);
  const visible = folderTree(folders).filter((folder) =>
    ancestorIds(folders, folder.id).every((id) => !isCollapsed(id)),
  );

  function toggle(id) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (isCollapsed(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <nav aria-label="Folders" className="space-y-0.5">
      {visible.map((folder) => (
        <TreeItem
          key={folder.id}
          isActive={selection === folder.id}
          depth={folder.depth}
          onClick={() => onSelect(folder.id)}
          icon={
            folder.kind === 'briefs' ? NotebookPen : selection === folder.id ? FolderOpen : Folder
          }
          label={folder.name}
          featured={folder.kind === 'briefs'}
          count={folder.fileCount}
          locked={folder.locked}
          roomy={roomy}
          expanded={parents.has(folder.id) ? !isCollapsed(folder.id) : undefined}
          onToggle={() => toggle(folder.id)}
          menuItems={folderMenuItems({
            folder,
            canEdit,
            canManage,
            onOpen: selection === folder.id ? null : onSelect,
            onAction: onFolderAction,
          })}
        />
      ))}
      <div className="border-line/70 !mt-3 border-t pt-3">
        <TreeItem
          isActive={selection === 'trash'}
          onClick={() => onSelect('trash')}
          icon={Trash2}
          label="Trash"
          tone="danger"
          roomy={roomy}
        />
      </div>
    </nav>
  );
}

// Phones: one bar naming the open folder; tapping it brings the whole tree up
// as a bottom sheet, the way a phone's own file app switches folders.
export function MobileFolderBar({ folders, selection, canEdit, onSelect, onCreateFolder }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const current = folders.find((folder) => folder.id === selection);
  const isTrash = selection === 'trash';
  const CurrentIcon = isTrash ? Trash2 : current?.kind === 'briefs' ? NotebookPen : FolderOpen;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="border-line/80 bg-surface flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border px-3.5 text-left shadow-sm active:scale-[0.99]"
      >
        <CurrentIcon
          className={cn('h-5 w-5 shrink-0', isTrash ? 'text-danger' : 'text-accent')}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="text-muted block text-[10px] font-semibold uppercase tracking-[0.14em]">
            Folder
          </span>
          <span className="block truncate text-sm font-semibold leading-tight">
            {isTrash ? 'Trash' : (current?.name ?? 'Choose a folder')}
          </span>
        </span>
        {current?.locked && <Lock className="text-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <ChevronsUpDown className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {canEdit && (
        <button
          type="button"
          onClick={onCreateFolder}
          aria-label="New folder"
          className="border-line/80 bg-surface text-muted hover:text-ink grid h-12 w-12 shrink-0 place-items-center rounded-2xl border shadow-sm active:scale-95"
        >
          <FolderPlus className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-label="Choose a folder"
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClick={(event) => event.target === dialogRef.current && setOpen(false)}
        className="bg-surface text-ink backdrop:bg-ink/40 m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-3xl p-0 shadow-2xl backdrop:backdrop-blur-[2px] open:animate-[sheet-up_260ms_cubic-bezier(0.22,1,0.36,1)]"
      >
        {open && (
          <div className="flex max-h-[85dvh] flex-col">
            <div className="bg-line mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full" aria-hidden />
            <header className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
              <h2 className="text-base font-semibold">Folders</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="bg-subtle grid h-9 w-9 place-items-center rounded-full"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>
            <div className="overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <FolderTree
                folders={folders}
                selection={selection}
                roomy
                onSelect={(value) => {
                  setOpen(false);
                  onSelect(value);
                }}
              />
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
