import { FolderKanban, StickyNote } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Badge } from '../../components/ui/Badge.jsx';
import { formatDate } from '../../lib/dates.js';
import { formatBytes } from '../../lib/format.js';
import { useAiAvailable } from '../ai/aiBridge.js';
import { ActionMenu } from './ActionMenu.jsx';
import { fileMenuItems, handleFileShortcut } from './fileActions.js';
import { fileStatus } from './fileMeta.js';
import { fileTint } from './FileThumbnail.jsx';
import { cn } from '../../lib/cn.js';
import { FileTypeIcon } from './FileTypeIcon.jsx';

// A pointer that rests this long on a file probably means a click is coming.
const WARM_DELAY_MS = 150;

// Hover/focus handlers that call onWarm(file) when the viewer looks likely to
// open it. Shared by list rows and grid cards.
export function useWarmHandlers(file, onWarm, enabled) {
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!onWarm || !enabled || !file.previewable) return {};
  return {
    onPointerEnter: () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => onWarm(file), WARM_DELAY_MS);
    },
    onPointerLeave: () => clearTimeout(timer.current),
    onFocus: () => onWarm(file),
  };
}

// A file's tags as small chips (the first few), a marker when it has a note,
// and one for the projects it is linked to (their names show on hover).
export function FileMarks({ file, max = 2, className }) {
  const tags = file.tags ?? [];
  const projects = (file.linkedProjects ?? []).filter((project) => project.title);
  if (tags.length === 0 && !file.note && projects.length === 0) return null;
  const projectNames = projects.map((project) => project.title).join(', ');
  return (
    <span className={cn('flex min-w-0 items-center gap-1', className)}>
      {projects.length > 0 && (
        <span
          title={`Linked to ${projectNames}`}
          className="bg-lavender text-ink inline-flex max-w-[9rem] shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium"
        >
          <FolderKanban className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {projects.length === 1 ? projects[0].title : `${projects.length} projects`}
          </span>
          <span className="sr-only">Linked to {projectNames}</span>
        </span>
      )}
      {file.note && (
        <span title={file.note} className="text-accent shrink-0">
          <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Note: {file.note}</span>
        </span>
      )}
      {tags.slice(0, max).map((tag) => (
        <span
          key={tag}
          className="bg-subtle text-muted max-w-[7rem] truncate rounded-full px-1.5 py-px text-[11px]"
        >
          {tag}
        </span>
      ))}
      {tags.length > max && (
        <span className="text-muted shrink-0 text-[11px]" title={tags.slice(max).join(', ')}>
          +{tags.length - max}
        </span>
      )}
    </span>
  );
}

// onWarm(file): optional; called when the viewer looks likely to open the file.
// selected + onToggleSelect(file): optional; adds a checkbox in front of the row.
export function FileRow({
  file,
  inTrash,
  canEdit,
  canTranscribe,
  onAction,
  onWarm,
  selected,
  onToggleSelect,
  linked = false,
}) {
  const status = fileStatus(file.status);
  // Under a project it is only linked to, a file can't be renamed or trashed.
  const shortcutEdit = canEdit && !linked;
  const warmHandlers = useWarmHandlers(file, onWarm, !inTrash);
  const askAi = useAiAvailable();
  const date = formatDate(inTrash ? file.deletedAt : file.createdAt);

  return (
    <tr
      tabIndex={0}
      onKeyDown={(event) =>
        handleFileShortcut(event, { file, inTrash, canEdit: shortcutEdit, onAction })
      }
      // One click or tap opens the file (the ⋯ menu and checkbox stop their own clicks).
      onClick={inTrash ? undefined : () => onAction('open', file)}
      {...warmHandlers}
      className={cn(
        'border-line/70 hover:bg-subtle/50 focus-visible:bg-subtle/60 group border-b transition-colors last:border-b-0 focus-visible:ring-inset',
        !inTrash && 'cursor-pointer',
        selected && 'bg-accent/10 hover:bg-accent/15',
      )}
    >
      {onToggleSelect && (
        // The cell is the tap target; it must not also open the file.
        <td className="py-2 pl-4 pr-0" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Select ${file.name}`}
            checked={selected}
            onChange={() => onToggleSelect(file)}
            onKeyDown={(event) => event.stopPropagation()}
            className="accent-accent block h-4 w-4"
          />
        </td>
      )}
      <td className={cn('w-full max-w-0 py-2 pr-2', onToggleSelect ? 'pl-3' : 'pl-4')}>
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
              fileTint(file.category),
            )}
          >
            <FileTypeIcon category={file.category} className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-semibold" title={file.name}>
                {file.name}
              </p>
              <FileMarks file={file} className="hidden shrink-0 sm:flex" />
            </div>
            <p className="text-muted truncate text-xs tabular-nums sm:hidden">
              {formatBytes(file.size)} · {date}
            </p>
            <FileMarks file={file} className="mt-0.5 sm:hidden" />
          </div>
        </div>
      </td>
      <td className="text-muted hidden whitespace-nowrap px-2 text-sm tabular-nums sm:table-cell">
        {formatBytes(file.size)}
      </td>
      <td className="hidden px-2 md:table-cell">
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
      <td className="text-muted hidden whitespace-nowrap px-2 text-sm lg:table-cell">
        {file.uploadedBy?.name ?? '—'} · {date}
      </td>
      <td className="py-2 pl-1 pr-2 sm:pr-3">
        <div className="flex justify-end">
          <ActionMenu
            label={`Actions for ${file.name}`}
            title={file.name}
            items={fileMenuItems({
              file,
              inTrash,
              canEdit,
              canTranscribe,
              linked,
              onAction,
              askAi,
            })}
            revealOnHover
          />
        </div>
      </td>
    </tr>
  );
}
