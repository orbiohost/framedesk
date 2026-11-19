import { ChevronDown, ChevronUp, Lock, Maximize2, Users, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '../../lib/cn.js';
import { useQuickNotes } from './hooks.js';
import { NoteMarkdown } from './NoteMarkdown.jsx';
import { NoteTextEditor } from './NoteTextEditor.jsx';
import { NoteWindow } from './NoteWindow.jsx';
import { STICKY_COLORS, STICKY_WIDTH, usePinnedNotes } from './pinnedNotes.js';
import { useNoteDraft } from './useNoteDraft.js';

// Paper tints for sticky notes (the app's own palette tokens).
export const PAPER = {
  peach: 'bg-peach',
  mint: 'bg-mint',
  lavender: 'bg-lavender',
  pink: 'bg-pink',
  paper: 'bg-surface',
};
const PAPER_LABEL = {
  peach: 'Yellow',
  mint: 'Green',
  lavender: 'Purple',
  pink: 'Pink',
  paper: 'White',
};

function subscribeViewport(callback) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}
const viewportSnapshot = () => `${window.innerWidth}x${window.innerHeight}`;

// The window size, so stickies stay on screen when it shrinks.
function useViewport() {
  const size = useSyncExternalStore(subscribeViewport, viewportSnapshot, () => '1280x800');
  const [width, height] = size.split('x').map(Number);
  return { width, height };
}

function clampTo(viewport, width, { x, y }) {
  return {
    x: Math.round(Math.min(Math.max(8, x), Math.max(8, viewport.width - width - 8))),
    y: Math.round(Math.min(Math.max(8, y), Math.max(8, viewport.height - 48))),
  };
}

function SaveState({ status, dirty }) {
  if (status === 'error') return <span className="text-danger">Not saved</span>;
  if (status === 'saving' || dirty) return <span>Saving…</span>;
  if (status === 'saved') return <span>Saved</span>;
  return null;
}

function HeaderButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="text-ink/60 hover:text-ink grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function StickyNote({ workspaceId, item, note, layer, viewport, store, onOpen }) {
  const draft = useNoteDraft(workspaceId, note ?? null, {
    onCreated: (saved) => store.replaceId(item.id, saved.id),
  });
  const [dragPos, setDragPos] = useState(null);
  const [colorsOpen, setColorsOpen] = useState(false);
  const drag = useRef(null);
  const width = Math.min(STICKY_WIDTH, viewport.width - 16);
  const pos = clampTo(viewport, width, dragPos ?? item);
  const editable = !note || note.isMine;
  const label =
    draft.draft.title.trim() || note?.title || (note || draft.draft.body ? 'Note' : 'New note');

  function onPointerDown(event) {
    if (event.button !== 0 || event.target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { dx: event.clientX - pos.x, dy: event.clientY - pos.y };
    setDragPos(pos);
  }
  function onPointerMove(event) {
    if (!drag.current) return;
    setDragPos({ x: event.clientX - drag.current.dx, y: event.clientY - drag.current.dy });
  }
  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    store.patch(item.id, clampTo(viewport, width, dragPos ?? pos));
    setDragPos(null);
  }

  function close() {
    draft.flush();
    store.unpin(item.id);
  }

  return (
    <section
      role="dialog"
      aria-label={`Sticky note: ${label}`}
      style={{ left: pos.x, top: pos.y, width, zIndex: 26 + layer }}
      onPointerDownCapture={() => store.raise(item.id)}
      className={cn(
        'border-ink/10 text-ink fixed flex animate-[fade-in_120ms_ease-out] flex-col overflow-hidden rounded-lg border shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_24px_-6px_rgb(0_0_0/0.18)]',
        PAPER[item.color] ?? PAPER.peach,
        dragPos && 'shadow-[0_2px_4px_rgb(0_0_0/0.08),0_16px_36px_-8px_rgb(0_0_0/0.28)]',
      )}
    >
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(event) =>
          !event.target.closest('button') && store.patch(item.id, { min: !item.min })
        }
        className={cn(
          'flex h-9 shrink-0 touch-none select-none items-center gap-0.5 pl-3 pr-1',
          dragPos ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{label}</span>
        <button
          type="button"
          onClick={() => setColorsOpen((open) => !open)}
          title="Paper colour"
          aria-label="Paper colour"
          aria-expanded={colorsOpen}
          className="grid h-7 w-7 place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
        >
          <span
            className={cn(
              'border-ink/25 h-3 w-3 rounded-full border',
              PAPER[item.color] ?? PAPER.peach,
            )}
          />
        </button>
        {draft.id && (
          <HeaderButton
            label="Open full note"
            onClick={async () => {
              await draft.flush();
              onOpen(draft.id);
            }}
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </HeaderButton>
        )}
        <HeaderButton
          label={item.min ? 'Expand' : 'Fold'}
          onClick={() => store.patch(item.id, { min: !item.min })}
        >
          {item.min ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </HeaderButton>
        <HeaderButton label="Take off screen" onClick={close}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </HeaderButton>
      </header>

      {colorsOpen && (
        <div className="border-ink/10 flex items-center gap-1.5 border-t px-3 py-2">
          {STICKY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                store.patch(item.id, { color });
                setColorsOpen(false);
              }}
              title={PAPER_LABEL[color]}
              aria-label={PAPER_LABEL[color]}
              aria-pressed={item.color === color}
              className={cn(
                'border-ink/20 h-5 w-5 rounded-full border transition-transform hover:scale-110',
                PAPER[color],
                item.color === color && 'ring-ink/50 ring-2 ring-offset-1',
              )}
            />
          ))}
        </div>
      )}

      {!item.min && (
        <>
          <div className="border-ink/10 border-t">
            {editable ? (
              <>
                <input
                  value={draft.draft.title}
                  onChange={(event) => draft.change('title', event.target.value)}
                  maxLength={160}
                  placeholder="Title"
                  aria-label="Note title"
                  className="placeholder:text-ink/40 w-full bg-transparent px-3 pb-0.5 pt-2.5 text-sm font-semibold outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <NoteTextEditor
                  value={draft.draft.body}
                  onChange={(body) => draft.change('body', body)}
                  onSubmit={draft.flush}
                  toolbar="compact"
                  workspaceId={workspaceId}
                  autoFocus={!note}
                  placeholder="Write something…"
                  aria-label="Note"
                  className="scrollbar-thin max-h-[min(50vh,20rem)] min-h-24 overflow-y-auto !px-3 py-1 text-[13px]"
                />
              </>
            ) : (
              <div className="scrollbar-thin max-h-[min(50vh,20rem)] overflow-y-auto px-3 py-2.5">
                {note.title && <p className="mb-1 text-sm font-semibold">{note.title}</p>}
                <NoteMarkdown text={note.body} className="text-[13px]" />
              </div>
            )}
          </div>
          <footer className="text-ink/55 flex h-7 shrink-0 items-center gap-2 px-3 text-[11px]">
            {note ? (
              <span className="flex items-center gap-1">
                {note.visibility === 'workspace' ? (
                  <Users className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Lock className="h-3 w-3" aria-hidden="true" />
                )}
                {note.isMine
                  ? note.visibility === 'workspace'
                    ? 'Team'
                    : 'Only me'
                  : (note.author?.name ?? 'Team')}
              </span>
            ) : (
              <span>Saves as you type</span>
            )}
            <span className="ml-auto">
              <SaveState status={draft.status} dirty={draft.dirty} />
            </span>
          </footer>
        </>
      )}
    </section>
  );
}

// Every note pinned to the screen, floating over whatever page is open.
export function PinnedNotes({ workspaceId }) {
  const store = usePinnedNotes(workspaceId);
  const viewport = useViewport();
  const hasSaved = store.items.some((item) => !item.id.startsWith('draft-'));
  const notes = useQuickNotes(workspaceId, {}, { enabled: hasSaved });
  const byId = new Map((notes.data ?? []).map((note) => [note.id, note]));
  const { unpin } = store;
  // The note opened big from a sticky (its full editor in a window).
  const [openId, setOpenId] = useState(null);

  // A pinned note that's gone (deleted, or no longer shared) comes off the screen.
  const settled = notes.isSuccess && !notes.isFetching;
  const missing = settled
    ? store.items.filter((item) => !item.id.startsWith('draft-') && !byId.has(item.id))
    : [];
  const missingIds = missing.map((item) => item.id).join(',');
  useEffect(() => {
    if (missingIds) missingIds.split(',').forEach((id) => unpin(id));
  }, [missingIds, unpin]);

  if (!store.items.length && !openId) return null;
  // Stable DOM order (so dragging never re-mounts a note); stacking follows the store.
  const ordered = [...store.items].sort((a, b) => (a.key ?? a.id).localeCompare(b.key ?? b.id));
  return (
    <div className="print:hidden">
      {ordered.map((item) => {
        const note = byId.get(item.id);
        const isDraft = item.id.startsWith('draft-');
        if (!isDraft && !note && !item.key?.startsWith('draft-')) return null;
        return (
          <StickyNote
            key={item.key ?? item.id}
            workspaceId={workspaceId}
            item={item}
            note={note}
            layer={store.items.indexOf(item)}
            viewport={viewport}
            store={store}
            onOpen={setOpenId}
          />
        );
      })}
      <NoteWindow workspaceId={workspaceId} noteId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
