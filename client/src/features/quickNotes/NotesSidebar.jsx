import { Pin, Plus, Search, X } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { plainText, shortTime, titleOf } from './noteText.js';

// The notes list beside an open note (wide screens): switch notes in one click.
export function NotesSidebar({ notes = [], activeId, onSelect, onNew, className }) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const shown = deferred
    ? notes.filter((note) =>
        `${note.title ?? ''} ${plainText(note.body)}`.toLowerCase().includes(deferred),
      )
    : notes;

  return (
    <aside
      aria-label="Notes"
      className={cn(
        'border-line/70 bg-surface flex min-h-0 flex-col overflow-hidden rounded-2xl border shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <p className="text-sm font-semibold">Notes</p>
        <span className="text-muted text-xs tabular-nums">{notes.length}</span>
        <button
          type="button"
          onClick={onNew}
          className="bg-ink text-surface hover:bg-ink/90 ml-auto inline-flex h-7 items-center gap-1 rounded-lg pl-1.5 pr-2.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New
        </button>
      </div>
      <div className="px-3 pb-2">
        <label className="bg-subtle focus-within:ring-ink/15 flex h-8 items-center gap-2 rounded-lg px-2.5 focus-within:ring-2">
          <Search className="text-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search notes"
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
      </div>
      <ul className="scrollbar-thin border-line/70 min-h-0 flex-1 space-y-px overflow-y-auto border-t p-1.5">
        {shown.length === 0 && (
          <li className="text-muted px-3 py-6 text-center text-xs">
            {deferred ? 'No notes match.' : 'No notes yet.'}
          </li>
        )}
        {shown.map((note) => {
          const active = note.id === activeId;
          const snippet = note.title ? plainText(note.body) : '';
          return (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => onSelect(note)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                  active ? 'bg-subtle' : 'hover:bg-subtle/60',
                )}
              >
                <span className="flex items-baseline gap-1.5">
                  {note.pinned && (
                    <Pin className="text-muted h-3 w-3 shrink-0 self-center" aria-label="Pinned" />
                  )}
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[13px]',
                      active ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {titleOf(note)}
                  </span>
                  <span className="text-muted shrink-0 text-[11px] tabular-nums">
                    {shortTime(note.updatedAt)}
                  </span>
                </span>
                {snippet && (
                  <span className="text-muted mt-0.5 block truncate text-xs">{snippet}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
