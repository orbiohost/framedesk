import { formatDistanceToNowStrict } from 'date-fns';
import { ArrowLeft, Copy, PictureInPicture2, Pin, PinOff, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import { openAi, useAiAvailable } from '../ai/aiBridge.js';
import { ActionMenu } from '../files/ActionMenu.jsx';
import { ConfirmDialog } from '../files/FileDialogs.jsx';
import { useDeleteQuickNote, useSaveQuickNote } from './hooks.js';
import { VisibilityToggle } from './NoteComposer.jsx';
import { checklistProgress } from './noteFormat.js';
import { NoteMarkdown } from './NoteMarkdown.jsx';
import { wordCount } from './noteText.js';
import { NoteTextEditor } from './NoteTextEditor.jsx';
import { MAX_PINNED, usePinnedNotes } from './pinnedNotes.js';
import { ProjectPicker } from './ProjectPicker.jsx';
import { useNoteDraft } from './useNoteDraft.js';

const VISIBILITY_KEY = 'quick-notes:visibility';

function saveLabel({ status, dirty }) {
  if (status === 'error') return 'Couldn’t save';
  if (status === 'saving' || dirty) return 'Saving…';
  if (status === 'saved') return 'Saved';
  return null;
}

function BarButton({ onClick, active, disabled, title, className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-40',
        active ? 'bg-ink text-surface' : 'text-muted hover:bg-subtle hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

function ago(iso) {
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

/**
 * A note opened on the Notes page, as a document filling the section. Saves
 * as you type. note null: a new note (created on the first save; onCreated
 * gets it). A teammate's shared note is read-only.
 */
export function NoteDocument({ workspaceId, note, onBack, onCreated, showBack = true, className }) {
  const [visibility, setVisibility] = useState(
    () => note?.visibility ?? (readLocal(VISIBILITY_KEY) === 'workspace' ? 'workspace' : 'private'),
  );
  const [projectIds, setProjectIds] = useState(
    () => note?.projects.map((project) => project.id) ?? [],
  );
  const createFields = useCallback(() => ({ projectIds }), [projectIds]);
  const draft = useNoteDraft(workspaceId, note, { onCreated, createFields });
  const save = useSaveQuickNote(workspaceId);
  const remove = useDeleteQuickNote(workspaceId);
  const screen = usePinnedNotes(workspaceId);
  const aiAvailable = useAiAvailable();
  const [deleting, setDeleting] = useState(false);
  const [dictationError, setDictationError] = useState(null);

  const id = draft.id;
  const mine = !note || note.isMine;
  const onScreen = Boolean(id) && screen.isPinned(id);
  const body = mine ? draft.draft.body : note.body;
  const todos = checklistProgress(body);
  const words = wordCount(body);
  const status = saveLabel(draft);

  async function back() {
    await draft.flush();
    onBack();
  }

  function changeVisibility(next) {
    setVisibility(next);
    if (!note) writeLocal(VISIBILITY_KEY, next);
    if (id) save.mutate({ id, visibility: next });
  }

  function changeProjects(next) {
    setProjectIds(next);
    if (id) save.mutate({ id, projectIds: next });
  }

  async function copyText() {
    const title = mine ? draft.draft.title : note.title;
    try {
      await navigator.clipboard.writeText(title ? `${title}\n\n${body}` : body);
    } catch {
      // Clipboard blocked; nothing to do.
    }
  }

  const menuItems = id
    ? [
        aiAvailable && {
          key: 'ask-ai',
          label: 'Ask AI about this note',
          icon: Sparkles,
          onSelect: () =>
            openAi({ note: { id, title: draft.draft.title || note?.title || 'Note' } }),
        },
        { key: 'copy', label: 'Copy text', icon: Copy, onSelect: copyText },
        mine &&
          note && {
            key: 'pin',
            label: note.pinned ? 'Unpin from top' : 'Pin to top of notes',
            icon: note.pinned ? PinOff : Pin,
            onSelect: () => save.mutate({ id, pinned: !note.pinned }),
          },
        mine && {
          key: 'delete',
          label: 'Delete note',
          icon: Trash2,
          danger: true,
          divider: true,
          onSelect: () => setDeleting(true),
        },
      ].filter(Boolean)
    : [];

  const edited = note && new Date(note.updatedAt) - new Date(note.createdAt) > 60 * 1000;
  const when = !note
    ? 'New note'
    : edited
      ? `Edited ${ago(note.updatedAt)}`
      : `Created ${ago(note.createdAt)}`;

  return (
    <div
      className={cn(
        'border-line/70 bg-surface flex min-h-0 flex-col overflow-hidden rounded-2xl border shadow-sm',
        className,
      )}
    >
      {/* The note's own bar: back, and what to do with the note. */}
      <div className="border-line/70 flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5 sm:px-3">
        {showBack && (
          <BarButton onClick={back} title="Back to all notes" className="text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">Notes</span>
          </BarButton>
        )}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {mine && (
            <>
              <ProjectPicker
                workspaceId={workspaceId}
                value={projectIds}
                onChange={changeProjects}
              />
              <VisibilityToggle value={visibility} onChange={changeVisibility} />
            </>
          )}
          <BarButton
            onClick={() => (onScreen ? screen.unpin(id) : screen.pin(id))}
            active={onScreen}
            disabled={!id || (!onScreen && screen.full)}
            title={
              !id
                ? 'Write something first'
                : !onScreen && screen.full
                  ? `Up to ${MAX_PINNED} sticky notes on screen`
                  : 'Keep this note floating over every page'
            }
          >
            <PictureInPicture2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{onScreen ? 'On screen' : 'Pin to screen'}</span>
          </BarButton>
          {menuItems.length > 0 && (
            <ActionMenu label="More note actions" title="Note" items={menuItems} />
          )}
        </span>
      </div>

      {/* Scrolls on its own, so the toolbar can stay at its top. */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[50rem] flex-col px-5 pb-16 pt-7 sm:px-10">
          {mine ? (
            <>
              <input
                value={draft.draft.title}
                onChange={(event) => draft.change('title', event.target.value)}
                maxLength={160}
                placeholder="Untitled"
                aria-label="Note title"
                autoFocus={!note}
                className="placeholder:text-muted/40 w-full bg-transparent text-[26px] font-semibold leading-tight tracking-tight outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-[30px]"
              />
              <p className="text-muted mt-1.5 text-xs">{when}</p>
              {(dictationError || draft.error) && (
                <p className="text-danger mt-2 text-xs">{dictationError || draft.error}</p>
              )}
              <div className="note-document mt-4 flex flex-1 flex-col">
                <NoteTextEditor
                  value={draft.draft.body}
                  onChange={(next) => draft.change('body', next)}
                  onSubmit={draft.flush}
                  workspaceId={workspaceId}
                  onDictationError={setDictationError}
                  autoFocus={Boolean(note) && !note.body}
                  placeholder="Start writing…  “[ ] ” makes a to-do, “- ” a list, #tags group notes"
                  aria-label="Note"
                  className="min-h-[40dvh] flex-1 cursor-text !px-1 pt-3"
                />
              </div>
            </>
          ) : (
            <>
              {note.title && (
                <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
                  {note.title}
                </h1>
              )}
              <p className="text-muted mt-1.5 text-xs">
                By {note.author?.name ?? 'a teammate'} · {when} · only they can edit it
              </p>
              <NoteMarkdown text={note.body} className="mt-6 text-base leading-7" />
            </>
          )}
        </div>
      </div>

      {/* Status line. */}
      <div className="border-line/70 text-muted flex h-8 shrink-0 items-center gap-3 border-t px-4 text-[11px] tabular-nums">
        <span>
          {words} {words === 1 ? 'word' : 'words'}
        </span>
        {todos.total > 0 && (
          <span className={cn(todos.done === todos.total && 'text-success')}>
            {todos.done}/{todos.total} to-dos done
          </span>
        )}
        {status && (
          <span className={cn('ml-auto', draft.status === 'error' && 'text-danger')}>{status}</span>
        )}
        {!status && mine && <span className="ml-auto hidden sm:inline">Saves as you type</span>}
      </div>

      <ConfirmDialog
        open={deleting}
        title="Delete this note?"
        confirmLabel="Delete note"
        pending={remove.isPending}
        error={remove.error?.message}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              screen.unpin(id);
              setDeleting(false);
              onBack();
            },
          })
        }
        onClose={() => {
          setDeleting(false);
          remove.reset();
        }}
      >
        The note is removed for good{visibility === 'workspace' ? ', for everyone on the team' : ''}
        .
      </ConfirmDialog>
    </div>
  );
}
