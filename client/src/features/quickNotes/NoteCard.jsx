import { formatDistanceToNowStrict } from 'date-fns';
import {
  Copy,
  FolderKanban,
  ListChecks,
  Lock,
  Maximize2,
  Pencil,
  Pin,
  PinOff,
  Sparkles,
  PictureInPicture2,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { openAi, useAiAvailable } from '../ai/aiBridge.js';
import { ActionMenu } from '../files/ActionMenu.jsx';
import { ConfirmDialog } from '../files/FileDialogs.jsx';
import { useDeleteQuickNote, useSaveQuickNote, useToggleNoteTodo } from './hooks.js';
import { NoteWindow } from './NoteWindow.jsx';
import { checklistProgress } from './noteFormat.js';
import { usePinnedNotes } from './pinnedNotes.js';
import { NoteMarkdown } from './NoteMarkdown.jsx';

// Taller than this, a card folds with "Show more".
const LONG_LINES = 14;
const LONG_CHARS = 700;

function timeAgo(iso) {
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

/**
 * compact: the dashboard's smaller card (no footer details, folds sooner).
 */
export function NoteCard({
  workspaceId,
  note,
  onTagClick,
  hideProjectId,
  compact = false,
  // Opens the note in the page instead of the pop-up window (the Notes page).
  onOpen,
}) {
  // Open in the note window (the full editor; read-only for a teammate's note).
  const [isOpen, setIsOpenState] = useState(false);
  const setIsOpen = (open) => (open && onOpen ? onOpen(note) : setIsOpenState(open));
  const [isDeleting, setIsDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const save = useSaveQuickNote(workspaceId);
  const remove = useDeleteQuickNote(workspaceId);
  const toggleTodo = useToggleNoteTodo(workspaceId);
  const [copied, setCopied] = useState(false);
  const aiAvailable = useAiAvailable();
  const screen = usePinnedNotes(workspaceId);

  const shared = note.visibility === 'workspace';
  const lineCount = note.body.split('\n').length;
  const isLong = compact
    ? lineCount > 6 || note.body.length > 280
    : lineCount > LONG_LINES || note.body.length > LONG_CHARS;
  const folded = isLong && !expanded;
  const todos = checklistProgress(note.body);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(note.title ? `${note.title}\n\n${note.body}` : note.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; nothing to do.
    }
  }
  const projects = note.projects.filter((project) => project.id !== hideProjectId);
  const edited = new Date(note.updatedAt) - new Date(note.createdAt) > 60 * 1000;

  const copyItem = {
    key: 'copy',
    label: copied ? 'Copied' : 'Copy text',
    icon: Copy,
    onSelect: copyText,
  };
  // A floating sticky over every page, for quick edits while working.
  const screenItem = {
    key: 'screen',
    label: screen.isPinned(note.id)
      ? 'Take off screen'
      : screen.full
        ? 'Pin to screen (6 max: close one first)'
        : 'Pin to screen',
    icon: PictureInPicture2,
    onSelect: () => (screen.isPinned(note.id) ? screen.unpin(note.id) : screen.pin(note.id)),
  };
  // A new AI chat with this note already added (as if picked with "#").
  const askItem = aiAvailable && {
    key: 'ask-ai',
    label: 'Ask AI about this note',
    icon: Sparkles,
    onSelect: () =>
      openAi({
        note: {
          id: note.id,
          title: note.title || note.body.split('\n')[0].slice(0, 80) || 'Note',
        },
      }),
  };
  const menuItems = note.isMine
    ? [
        { key: 'edit', label: 'Edit', icon: Pencil, onSelect: () => setIsOpen(true) },
        askItem,
        copyItem,
        screenItem,
        {
          key: 'pin',
          label: note.pinned ? 'Unpin' : 'Pin to top',
          icon: note.pinned ? PinOff : Pin,
          onSelect: () => save.mutate({ id: note.id, pinned: !note.pinned }),
        },
        {
          key: 'visibility',
          label: shared ? 'Make private' : 'Share with team',
          icon: shared ? Lock : Users,
          onSelect: () =>
            save.mutate({ id: note.id, visibility: shared ? 'private' : 'workspace' }),
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          danger: true,
          divider: true,
          onSelect: () => setIsDeleting(true),
        },
      ].filter(Boolean)
    : [
        { key: 'open', label: 'Open', icon: Maximize2, onSelect: () => setIsOpen(true) },
        askItem,
        copyItem,
        screenItem,
      ].filter(Boolean);

  // A click anywhere on the card opens it, except on its own controls (to-dos,
  // #tags, links, the menu, "Show more") or while selecting text to copy.
  function openFromClick(event) {
    // Clicks from portals (the menu's sheet on phones) bubble here through React.
    if (!event.currentTarget.contains(event.target)) return;
    if (event.target.closest('button, a, input, label, [role="checkbox"], [role="menu"], dialog')) {
      return;
    }
    if (window.getSelection()?.toString()) return;
    setIsOpen(true);
  }
  // AI chats are private, so only the person who saved the answer can open its chat.
  const fromAi = note.source?.kind === 'ai';

  return (
    <article
      onClick={openFromClick}
      className={cn(
        'border-line/70 bg-surface hover:border-line group relative cursor-pointer rounded-2xl border shadow-sm transition-[box-shadow,border-color] hover:shadow-md',
        compact ? 'p-3' : 'p-4',
        note.pinned && 'ring-accent/25 ring-2',
      )}
    >
      {/* In the corner, so a note without a title starts right at the top. */}
      <div
        className={cn(
          'absolute flex items-center gap-1',
          compact ? 'right-1.5 top-1.5' : 'right-2.5 top-2.5',
        )}
      >
        {note.pinned && (
          <Pin className="text-accent dark:text-ink h-3.5 w-3.5 shrink-0" aria-label="Pinned" />
        )}
        {menuItems.length > 0 && (
          <ActionMenu
            label="Note actions"
            title={note.title ?? 'Note'}
            items={menuItems}
            revealOnHover
          />
        )}
      </div>
      {note.title && (
        <h3 className="mb-1 break-words pr-14 text-[15px] font-semibold leading-snug">
          {note.title}
        </h3>
      )}

      <div
        className={cn(
          'relative',
          folded && (compact ? 'max-h-36 overflow-hidden' : 'max-h-80 overflow-hidden'),
        )}
        // The text runs under the corner menu only when there's a title above it.
        style={note.title ? undefined : { paddingRight: '3.5rem' }}
      >
        <NoteMarkdown
          text={note.body}
          onTagClick={onTagClick}
          onToggle={
            note.isMine
              ? (line) => toggleTodo.mutate({ id: note.id, body: note.body, line })
              : undefined
          }
        />
        {folded && (
          <div
            className="from-surface pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t to-transparent"
            aria-hidden="true"
          />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted hover:text-ink mt-1 text-xs font-medium"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {projects.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                to={`/w/${workspaceId}/projects/${project.id}/notes`}
                className="bg-subtle hover:bg-lavender inline-flex max-w-[14rem] items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
              >
                <FolderKanban className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{project.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className="text-muted mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {todos.total > 0 && (
          <>
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium',
                todos.done === todos.total && 'text-success',
              )}
            >
              <ListChecks className="h-3 w-3" aria-hidden="true" />
              {todos.done}/{todos.total} done
            </span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span
          className="inline-flex items-center gap-1"
          title={shared ? 'Shared with the team' : 'Only you can see this'}
        >
          {shared ? (
            <Users className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Lock className="h-3 w-3" aria-hidden="true" />
          )}
          {!compact && (shared ? 'Team' : 'Private')}
        </span>
        {!note.isMine && note.author && (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{note.author.name}</span>
          </>
        )}
        {fromAi && (
          <>
            <span aria-hidden="true">·</span>
            {note.isMine ? (
              <Link
                to={`/w/${workspaceId}/ai?thread=${note.source.threadId}`}
                title={note.source.question ? `Asked: ${note.source.question}` : 'Open the AI chat'}
                className="hover:text-ink inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                From AI chat
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                AI answer
              </span>
            )}
          </>
        )}
        <span aria-hidden="true">·</span>
        <time dateTime={note.updatedAt} title={new Date(note.updatedAt).toLocaleString()}>
          {edited ? `Edited ${timeAgo(note.updatedAt)}` : timeAgo(note.createdAt)}
        </time>
      </footer>
      {(save.error || toggleTodo.error) && (
        <p className="text-danger mt-2 text-xs">{(save.error ?? toggleTodo.error).message}</p>
      )}

      <NoteWindow
        workspaceId={workspaceId}
        noteId={isOpen ? note.id : null}
        note={note}
        onClose={() => setIsOpen(false)}
      />
      <ConfirmDialog
        open={isDeleting}
        title="Delete this note?"
        confirmLabel="Delete note"
        pending={remove.isPending}
        error={remove.error?.message}
        onConfirm={() => remove.mutate(note.id, { onSuccess: () => setIsDeleting(false) })}
        onClose={() => {
          setIsDeleting(false);
          remove.reset();
        }}
      >
        The note is removed for good{shared ? ', for everyone on the team' : ''}.
      </ConfirmDialog>
    </article>
  );
}
