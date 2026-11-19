import {
  ArrowLeft,
  Maximize2,
  NotebookPen,
  PictureInPicture2,
  Pin,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import { useDismiss } from '../../lib/useDismiss.js';
import { ConfirmDialog } from '../files/FileDialogs.jsx';
import { useDeleteQuickNote, useQuickNotes, useSaveQuickNote } from './hooks.js';
import { VisibilityToggle } from './NoteComposer.jsx';
import { NoteMarkdown } from './NoteMarkdown.jsx';
import { NoteTextEditor } from './NoteTextEditor.jsx';
import { NoteWindow } from './NoteWindow.jsx';
import { MAX_PINNED, usePinnedNotes } from './pinnedNotes.js';
import { useNoteDraft } from './useNoteDraft.js';
import { plainText, shortTime, titleOf } from './noteText.js';

const SCOPES = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'shared', label: 'Team' },
];

function isTyping(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function SaveState({ status, dirty }) {
  if (status === 'error') return <span className="text-danger">Couldn’t save</span>;
  if (status === 'saving' || dirty) return <span>Saving…</span>;
  if (status === 'saved') return <span>Saved</span>;
  return null;
}

function IconButton({ label, onClick, active, disabled, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-40',
        active ? 'bg-ink text-surface' : 'text-muted hover:bg-subtle hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

function NoteRow({ note, onOpen, onPin, onScreen }) {
  const snippet = note.title ? plainText(note.body) : '';
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(note)}
        className="hover:bg-subtle focus-visible:bg-subtle w-full rounded-lg px-2.5 py-2 pr-10 text-left"
      >
        <span className="flex items-baseline gap-1.5">
          {note.pinned && (
            <Pin className="text-muted h-3 w-3 shrink-0 self-center" aria-label="Pinned to top" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{titleOf(note)}</span>
          <span className="text-muted shrink-0 text-[11px] tabular-nums">
            {shortTime(note.updatedAt)}
          </span>
        </span>
        {(snippet || !note.isMine) && (
          <span className="text-muted mt-0.5 block truncate text-xs">
            {!note.isMine && <span className="text-ink/70">{note.author?.name ?? 'Team'} · </span>}
            {snippet}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => onPin(note)}
        title={onScreen ? 'On screen' : 'Pin to screen'}
        aria-label={onScreen ? `${titleOf(note)} is on screen` : `Pin ${titleOf(note)} to screen`}
        className={cn(
          'absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md transition-opacity',
          onScreen
            ? 'bg-ink text-surface'
            : 'text-muted hover:bg-surface hover:text-ink opacity-100 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
        )}
      >
        <PictureInPicture2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  );
}

function ListView({ workspaceId, onOpen, onNew, onNewSticky, onClose, pinned }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const deferred = useDeferredValue(query.trim());
  const params = { ...(deferred && { q: deferred }), ...(scope !== 'all' && { scope }) };
  const notes = useQuickNotes(workspaceId, params);
  const list = notes.data ?? [];
  const searching = Boolean(deferred) || scope !== 'all';

  function pinNote(note) {
    pinned.pin(note.id);
  }

  return (
    <>
      <div className="flex items-center gap-1 px-3 pb-2 pt-3">
        <p className="text-sm font-semibold">Notes</p>
        <span className="ml-auto flex items-center gap-1">
          <IconButton
            label={
              pinned.full
                ? `Up to ${MAX_PINNED} sticky notes on screen`
                : 'New sticky note on screen'
            }
            onClick={onNewSticky}
            disabled={pinned.full}
          >
            <StickyNote className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <button
            type="button"
            onClick={onNew}
            className="bg-ink text-surface hover:bg-ink/90 inline-flex h-8 items-center gap-1 rounded-lg pl-2 pr-2.5 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New note
          </button>
        </span>
      </div>

      <div className="px-3">
        <label className="bg-subtle focus-within:ring-ink/15 flex h-9 items-center gap-2 rounded-lg px-2.5 focus-within:ring-2">
          <Search className="text-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            autoFocus
            className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="mt-2 flex gap-3 text-xs" role="group" aria-label="Show">
          {SCOPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              aria-pressed={scope === option.value}
              className={cn(
                'border-b-2 pb-1 transition-colors',
                scope === option.value
                  ? 'border-ink text-ink font-medium'
                  : 'text-muted hover:text-ink border-transparent',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-line/70 border-t">
        {notes.isPending ? (
          <div className="space-y-2 p-3" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="bg-subtle h-10 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : notes.isError ? (
          <p className="text-danger px-4 py-6 text-sm">
            Couldn’t load notes. {notes.error.message}
          </p>
        ) : list.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium">{searching ? 'No notes match' : 'No notes yet'}</p>
            <p className="text-muted mt-1 text-xs">
              {searching
                ? 'Try another word, or clear the search.'
                : 'Write down the first thought.'}
            </p>
          </div>
        ) : (
          <ul className="scrollbar-thin max-h-[min(22rem,55vh)] space-y-px overflow-y-auto p-1.5">
            {list.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                onOpen={onOpen}
                onPin={pinNote}
                onScreen={pinned.isPinned(note.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="border-line/70 text-muted flex items-center border-t px-3 py-2 text-xs">
        <Link to={`/w/${workspaceId}/notes`} onClick={onClose} className="hover:text-ink">
          Open Notes page
        </Link>
        <span className="ml-auto hidden sm:inline">
          <kbd className="border-line rounded border px-1 font-sans text-[10px]">Alt</kbd>{' '}
          <kbd className="border-line rounded border px-1 font-sans text-[10px]">N</kbd> new note
        </span>
      </div>
    </>
  );
}

function EditorView({ workspaceId, note, onBack, onClose, onExpand, pinned }) {
  const draft = useNoteDraft(workspaceId, note);
  const save = useSaveQuickNote(workspaceId);
  const remove = useDeleteQuickNote(workspaceId);
  const [confirming, setConfirming] = useState(false);
  const [visibility, setVisibility] = useState(
    () =>
      note?.visibility ??
      (readLocal('quick-notes:visibility') === 'workspace' ? 'workspace' : 'private'),
  );
  const editable = !note || note.isMine;
  const id = draft.id;

  function changeVisibility(next) {
    setVisibility(next);
    // A new note remembers the choice (it's used on the first save, and next time).
    if (!note) writeLocal('quick-notes:visibility', next);
    if (id) save.mutate({ id, visibility: next });
  }

  async function back() {
    await draft.flush();
    onBack();
  }

  async function pinToScreen() {
    await draft.flush();
    if (draft.id && pinned.pin(draft.id)) onClose();
  }

  return (
    <div className="flex max-h-[min(34rem,75vh)] flex-col">
      <div className="flex items-center gap-1 px-2 pb-1 pt-2">
        <IconButton label="Back to notes" onClick={back}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </IconButton>
        <span className="text-muted ml-0.5 text-xs">
          <SaveState status={draft.status} dirty={draft.dirty} />
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <IconButton
            label={
              !id
                ? 'Write something first'
                : pinned.isPinned(id)
                  ? 'On screen'
                  : pinned.full
                    ? `Up to ${MAX_PINNED} sticky notes on screen`
                    : 'Pin to screen'
            }
            onClick={pinToScreen}
            active={Boolean(id) && pinned.isPinned(id)}
            disabled={!id || (pinned.full && !pinned.isPinned(id))}
          >
            <PictureInPicture2 className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          {id && (
            <IconButton
              label="Open full note"
              onClick={async () => {
                await draft.flush();
                onExpand(id);
              }}
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          )}
          {id && editable && (
            <IconButton
              label="Delete note"
              onClick={() => setConfirming(true)}
              className="hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          )}
        </span>
      </div>

      {editable ? (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <input
            value={draft.draft.title}
            onChange={(event) => draft.change('title', event.target.value)}
            maxLength={160}
            placeholder="Title"
            aria-label="Note title"
            autoFocus={Boolean(note)}
            className="placeholder:text-muted/70 w-full bg-transparent px-4 pb-1 pt-1.5 text-[15px] font-semibold outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <NoteTextEditor
            value={draft.draft.body}
            onChange={(body) => draft.change('body', body)}
            onSubmit={back}
            workspaceId={workspaceId}
            autoFocus={!note}
            placeholder="Write your thought… #tags group notes"
            aria-label="Note"
            className="min-h-40 py-1.5"
          />
        </div>
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
          {note.title && <p className="mb-1.5 text-[15px] font-semibold">{note.title}</p>}
          <NoteMarkdown text={note.body} />
          <p className="text-muted mt-3 text-xs">
            By {note.author?.name ?? 'a teammate'}. Only they can edit it.
          </p>
        </div>
      )}

      {editable && (
        <div className="border-line/70 flex items-center gap-2 border-t px-3 py-2">
          <VisibilityToggle value={visibility} onChange={changeVisibility} />
          {draft.error && <span className="text-danger truncate text-xs">{draft.error}</span>}
          <button
            type="button"
            onClick={back}
            className="bg-ink text-surface hover:bg-ink/90 ml-auto h-8 rounded-lg px-3 text-xs font-medium"
          >
            Done
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Delete this note?"
        confirmLabel="Delete"
        pending={remove.isPending}
        error={remove.error?.message}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              pinned.unpin(id);
              setConfirming(false);
              onBack();
            },
          })
        }
      >
        It’s removed for everyone it was shared with. This can’t be undone.
      </ConfirmDialog>
    </div>
  );
}

// The top bar's Notes button: search and open every note, write a new one, or
// put any note on screen as a sticky. Alt + N writes a new note from anywhere;
// Alt + Shift + N puts a new sticky on screen.
export function NotesMenu({ workspaceId }) {
  const [open, setOpen] = useState(false);
  // { kind: 'list' } | { kind: 'note', note } | { kind: 'new', key }
  const [view, setView] = useState({ kind: 'list' });
  const ref = useRef(null);
  const pinned = usePinnedNotes(workspaceId);
  // A note opened big, in the full editor window.
  const [windowId, setWindowId] = useState(null);
  const close = useCallback(() => {
    setOpen(false);
    setView({ kind: 'list' });
  }, []);
  useDismiss(ref, open, close);
  const { pinDraft } = pinned;

  useEffect(() => {
    function onKeyDown(event) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== 'KeyN') return;
      if (isTyping(event.target) && !event.target.closest?.('[data-notes-menu]')) return;
      event.preventDefault();
      if (event.shiftKey) {
        pinDraft();
        setOpen(false);
      } else {
        setView({ kind: 'new', key: Date.now() });
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pinDraft]);

  function newSticky() {
    if (pinned.pinDraft()) close();
  }

  return (
    <div ref={ref} className="relative" data-notes-menu>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label="Notes"
        title="Notes (Alt + N for a new one)"
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors',
          open ? 'bg-ink text-surface' : 'bg-subtle hover:bg-line/60',
        )}
      >
        <NotebookPen className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notes"
          className="border-line/70 bg-surface shadow-lift fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-40 animate-[fade-in_120ms_ease-out] overflow-hidden rounded-2xl border sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[23rem]"
        >
          {view.kind === 'list' ? (
            <ListView
              workspaceId={workspaceId}
              pinned={pinned}
              onOpen={(note) => setView({ kind: 'note', note })}
              onNew={() => setView({ kind: 'new', key: Date.now() })}
              onNewSticky={newSticky}
              onClose={close}
            />
          ) : (
            <EditorView
              key={view.kind === 'note' ? view.note.id : view.key}
              workspaceId={workspaceId}
              note={view.kind === 'note' ? view.note : null}
              pinned={pinned}
              onBack={() => setView({ kind: 'list' })}
              onClose={close}
              onExpand={(id) => {
                close();
                setWindowId(id);
              }}
            />
          )}
        </div>
      )}
      <NoteWindow workspaceId={workspaceId} noteId={windowId} onClose={() => setWindowId(null)} />
    </div>
  );
}
