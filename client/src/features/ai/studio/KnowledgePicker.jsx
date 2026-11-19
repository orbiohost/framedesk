import { NotebookPen, Plus, Search, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../../lib/cn.js';
import { useQuickNotes } from '../../quickNotes/hooks.js';
import { FileKindIcon, noteLabel } from '../AiComposer.jsx';
import { useAiFileSearch } from '../hooks.js';

// Search-and-add for an assistant's knowledge: Drive files or saved notes.
// value: [{ id, name|title, category? }]
export function KnowledgePicker({ workspaceId, kind, value, onChange, max }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const isFile = kind === 'file';
  const files = useAiFileSearch(workspaceId, { q: query }, { enabled: open && isFile });
  const notes = useQuickNotes(workspaceId, { q: query || undefined }, { enabled: open && !isFile });
  const taken = new Set(value.map((item) => item.id));
  const results = (isFile ? (files.data ?? []) : (notes.data ?? []))
    .filter((item) => !taken.has(item.id))
    .slice(0, 6);
  const full = value.length >= max;

  function add(item) {
    if (full) return;
    onChange([
      ...value,
      isFile
        ? { id: item.id, name: item.name, category: item.category }
        : { id: item.id, title: noteLabel(item) },
    ]);
    setQuery('');
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <li
              key={item.id}
              className="border-line/70 bg-surface inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border py-1 pl-2 pr-1 text-xs font-medium"
            >
              {isFile ? (
                <FileKindIcon
                  category={item.category}
                  className="text-muted h-3.5 w-3.5 shrink-0"
                />
              ) : (
                <NotebookPen className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
              )}
              <span className="truncate">{item.name ?? item.title}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((other) => other.id !== item.id))}
                aria-label={`Remove ${item.name ?? item.title}`}
                className="hover:bg-subtle grid h-5 w-5 shrink-0 place-items-center rounded-full"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className="text-muted text-xs">
          Up to {max} {isFile ? 'files' : 'notes'}.
        </p>
      ) : (
        <div className="relative">
          <Search
            className="text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={isFile ? 'Search your Drive files…' : 'Search your saved notes…'}
            aria-label={isFile ? 'Add a knowledge file' : 'Add a knowledge note'}
            className="border-line bg-surface focus:border-accent/60 focus:ring-accent/15 h-10 w-full rounded-xl border pl-9 pr-3 text-sm outline-none focus:ring-4"
          />
          {open && (
            <div className="border-line/70 bg-surface shadow-lift absolute inset-x-0 top-full z-20 mt-1 rounded-xl border p-1">
              {(isFile ? files.isFetching : notes.isFetching) && results.length === 0 ? (
                <p className="text-muted px-2.5 py-2 text-sm">Loading…</p>
              ) : results.length === 0 ? (
                <p className="text-muted px-2.5 py-2 text-sm">
                  {query ? 'Nothing matches' : isFile ? 'No files yet' : 'No notes yet'}
                </p>
              ) : (
                results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      add(item);
                    }}
                    className={cn(
                      'hover:bg-subtle flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm',
                    )}
                  >
                    {isFile ? (
                      <FileKindIcon
                        category={item.category}
                        className="text-muted h-4 w-4 shrink-0"
                      />
                    ) : (
                      <NotebookPen className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {isFile ? item.name : noteLabel(item)}
                    </span>
                    <Plus className="text-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
