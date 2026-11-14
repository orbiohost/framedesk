import { Check, MessageSquare, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { useNow } from '../../lib/useNow.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function groupOf(date, now) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const time = new Date(date).getTime();
  if (time >= startOfToday.getTime()) return 'Today';
  if (time >= startOfToday.getTime() - DAY_MS) return 'Yesterday';
  if (time >= startOfToday.getTime() - 7 * DAY_MS) return 'Previous 7 days';
  return 'Older';
}

function ThreadRow({ thread, active, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);
  const [confirming, setConfirming] = useState(false);

  function save(event) {
    event?.preventDefault();
    const next = title.trim();
    if (next && next !== thread.title) onRename(thread.id, next);
    setEditing(false);
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex items-center gap-1 rounded-xl px-1.5 py-1">
        <input
          autoFocus
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setTitle(thread.title);
              setEditing(false);
            }
          }}
          aria-label="Chat name"
          className="bg-subtle border-line min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm outline-none focus:border-fuchsia-400/60"
        />
        <button
          type="submit"
          aria-label="Save name"
          className="text-muted hover:text-ink grid h-7 w-7 place-items-center rounded-lg"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </form>
    );
  }

  return (
    <div
      className={cn(
        'group relative flex items-center rounded-xl transition-colors',
        active ? 'bg-subtle' : 'hover:bg-subtle/60',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(thread.id)}
        aria-current={active ? 'true' : undefined}
        className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm"
        title={thread.title}
      >
        <span className={cn(active ? 'text-ink font-medium' : 'text-ink/80')}>{thread.title}</span>
      </button>
      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5 pr-1.5',
          confirming ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
          'sm:group-focus-within:opacity-100',
        )}
      >
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => onDelete(thread.id)}
              className="bg-danger/10 text-danger rounded-lg px-2 py-1 text-xs font-medium"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              aria-label="Keep this chat"
              className="text-muted hover:text-ink grid h-7 w-7 place-items-center rounded-lg"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setTitle(thread.title);
                setEditing(true);
              }}
              aria-label={`Rename ${thread.title}`}
              className="text-muted hover:text-ink grid h-7 w-7 place-items-center rounded-lg"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${thread.title}`}
              className="text-muted hover:text-danger grid h-7 w-7 place-items-center rounded-lg"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// The list of past chats: newest first, grouped by day, searchable.
export function AiHistory({
  threads,
  isPending,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  className,
  header,
}) {
  const [query, setQuery] = useState('');
  const now = useNow(60_000);
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const map = new Map();
    for (const thread of threads ?? []) {
      if (needle && !thread.title.toLowerCase().includes(needle)) continue;
      const group = groupOf(thread.lastMessageAt, now);
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(thread);
    }
    return [...map.entries()];
  }, [threads, query, now]);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {header}
      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={onNew}
          className="border-line/70 hover:border-accent/40 hover:bg-subtle/60 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New chat
        </button>
        {(threads?.length ?? 0) > 5 && (
          <label className="bg-subtle flex items-center gap-2 rounded-xl px-3 py-1.5">
            <Search className="text-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        )}
      </div>
      <nav
        aria-label="Chat history"
        className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-3"
      >
        {isPending ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2].map((row) => (
              <div key={row} className="bg-subtle h-8 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="text-muted flex flex-col items-center gap-2 px-4 py-8 text-center text-sm">
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
            {query ? 'No chats match.' : 'Your chats will appear here.'}
          </div>
        ) : (
          groups.map(([group, items]) => (
            <div key={group}>
              <p className="text-muted px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                {group}
              </p>
              <div className="space-y-0.5">
                {items.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    active={thread.id === activeId}
                    onSelect={onSelect}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}
