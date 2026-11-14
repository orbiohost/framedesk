import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  FolderClosed,
  FolderKanban,
  ListTodo,
  Loader2,
  NotebookPen,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileTypeIcon } from '../features/files/FileTypeIcon.jsx';
import { api } from '../lib/apiClient.js';
import { cn } from '../lib/cn.js';
import { formatBytes, formatShortDate } from '../lib/format.js';
import { useDismiss } from '../lib/useDismiss.js';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const DEBOUNCE_MS = 200;
const FILES_PER_CATEGORY = 5;

const FILE_GROUPS = [
  { category: 'video', title: 'Videos' },
  { category: 'image', title: 'Images' },
  { category: 'audio', title: 'Audio' },
  { category: 'document', title: 'Documents' },
  { category: 'project', title: 'Project files' },
  { category: 'archive', title: 'Archives' },
  { category: null, title: 'Other files' },
];

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function useSearch(workspaceId, query) {
  return useQuery({
    queryKey: ['global-search', workspaceId, query],
    queryFn: () => api.get(`/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

// Bolds the part of the text that matches what was typed.
function Highlight({ text, query }) {
  if (!text) return null;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="text-ink rounded-sm bg-transparent font-semibold">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}

function iconOf(Icon) {
  return function GroupIcon({ className }) {
    return <Icon className={className} aria-hidden="true" />;
  };
}

// Server results -> ordered groups of { id, icon, label, hint, to, state }.
function buildGroups(data, workspaceId) {
  if (!data) return [];
  const base = `/w/${workspaceId}`;
  const groups = [];
  const add = (title, items) => items.length && groups.push({ title, items });

  add(
    'Projects',
    data.projects.map((project) => ({
      id: `p-${project.id}`,
      icon: iconOf(FolderKanban),
      label: project.title,
      hint: project.client ?? 'Project',
      to: `${base}/projects/${project.id}`,
    })),
  );

  const known = new Set(FILE_GROUPS.map((group) => group.category).filter(Boolean));
  for (const { category, title } of FILE_GROUPS) {
    const files = data.files.filter((file) =>
      category ? file.category === category : !known.has(file.category),
    );
    add(
      title,
      files.slice(0, FILES_PER_CATEGORY).map((file) => ({
        id: `f-${file.id}`,
        icon: ({ className }) => <FileTypeIcon category={file.category} className={className} />,
        label: file.name,
        hint: [file.project?.title ?? 'Drive', formatBytes(file.size)].join(' · '),
        to: file.project
          ? `${base}/projects/${file.project.id}/files?folder=${file.folderId}`
          : `${base}/drive?folder=${file.folderId}`,
        state: { openFile: file },
      })),
    );
  }

  add(
    'Folders',
    data.folders.map((folder) => ({
      id: `d-${folder.id}`,
      icon: iconOf(FolderClosed),
      label: folder.name,
      hint: folder.project?.title ?? 'Drive',
      to: folder.project
        ? `${base}/projects/${folder.project.id}/files?folder=${folder.id}`
        : `${base}/drive?folder=${folder.id}`,
    })),
  );
  add(
    'Tasks',
    data.tasks.map((task) => ({
      id: `t-${task.id}`,
      icon: iconOf(ListTodo),
      label: task.title,
      hint: task.project?.title ?? 'Task',
      to: task.project ? `${base}/projects/${task.project.id}/tasks` : `${base}/tasks`,
    })),
  );
  add(
    'Clients',
    data.clients.map((client) => ({
      id: `c-${client.id}`,
      icon: iconOf(Users),
      label: client.name,
      hint: [client.company, client.archived && 'Archived'].filter(Boolean).join(' · ') || 'Client',
      to: `${base}/clients/${client.id}`,
    })),
  );
  add(
    'Notes',
    data.notes.map((note) => ({
      id: `n-${note.id}`,
      icon: iconOf(NotebookPen),
      label: note.title,
      hint: note.excerpt ?? (note.shared ? 'Shared note' : 'Private note'),
      to: `${base}/notes?q=${encodeURIComponent(note.title)}`,
    })),
  );
  add(
    'Calendar',
    data.events.map((event) => ({
      id: `e-${event.id}`,
      icon: iconOf(CalendarDays),
      label: event.title,
      hint: [formatShortDate(event.startsAt), event.project?.title].filter(Boolean).join(' · '),
      to: `${base}/calendar`,
      state: { focusDate: event.startsAt },
    })),
  );
  return groups;
}

export function GlobalSearch({ workspaceId, className }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(containerRef, isOpen, close);

  const trimmed = query.trim();
  const debounced = useDebounced(trimmed, DEBOUNCE_MS);
  const search = useSearch(workspaceId, debounced);
  // Each row also gets its place in the flat list, for the arrow keys.
  const groups = useMemo(() => {
    let next = 0;
    return buildGroups(search.data, workspaceId).map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item, index: next++ })),
    }));
  }, [search.data, workspaceId]);
  const results = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const waiting = trimmed !== debounced || search.isFetching;

  // Ctrl+K / Cmd+K focuses the search from anywhere.
  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setIsOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // New results: start from the top again.
  const [highlightFor, setHighlightFor] = useState(search.data);
  if (highlightFor !== search.data) {
    setHighlightFor(search.data);
    setHighlight(0);
  }

  // Keep the highlighted row in view while moving with the arrow keys.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  function go(result) {
    navigate(result.to, { state: result.state });
    setQuery('');
    close();
    inputRef.current?.blur();
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && results[highlight]) {
      event.preventDefault();
      go(results[highlight]);
    } else if (event.key === 'Escape') {
      close();
      inputRef.current?.blur();
    }
  }

  const showPanel = isOpen && trimmed.length > 0;
  const settled = !waiting && debounced === trimmed;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <label className="bg-subtle focus-within:bg-surface focus-within:ring-accent/40 flex h-11 items-center gap-2.5 rounded-full px-4 transition-colors focus-within:ring-2">
        {waiting && showPanel ? (
          <Loader2 className="text-muted h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="sr-only">Search projects, files, tasks, clients and notes</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={query}
          maxLength={100}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search projects, files, tasks..."
          className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="text-muted hover:text-ink grid h-6 w-6 shrink-0 place-items-center rounded-full"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <kbd className="text-muted hidden shrink-0 text-xs font-medium sm:block">
            {IS_MAC ? '⌘K' : 'Ctrl K'}
          </kbd>
        )}
      </label>

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          ref={listRef}
          className="border-line/70 bg-surface shadow-lift absolute inset-x-0 top-full z-40 mt-2 max-h-[min(32rem,70dvh)] overflow-y-auto rounded-2xl border p-1.5"
        >
          {search.isError && (
            <p className="text-danger px-3 py-4 text-sm">Search isn’t working right now.</p>
          )}
          {!search.isError && results.length === 0 && (
            <p className="text-muted px-3 py-4 text-sm">
              {settled ? <>Nothing matches “{trimmed}”.</> : 'Searching…'}
            </p>
          )}
          {groups.map((group) => (
            <div key={group.title} role="group" aria-label={group.title} className="py-1">
              <p className="text-muted px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                {group.title}
                <span className="ml-1.5 font-normal normal-case tracking-normal">
                  {group.items.length}
                </span>
              </p>
              {group.items.map((result) => {
                const current = result.index;
                const Icon = result.icon;
                return (
                  <button
                    key={result.id}
                    type="button"
                    role="option"
                    data-index={current}
                    aria-selected={current === highlight}
                    onMouseMove={() => setHighlight(current)}
                    onClick={() => go(result)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left',
                      current === highlight && 'bg-subtle',
                    )}
                  >
                    <span className="bg-lavender text-accent dark:text-ink grid h-8 w-8 shrink-0 place-items-center rounded-full">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink/90 block truncate text-sm">
                        <Highlight text={result.label} query={debounced} />
                      </span>
                      <span className="text-muted block truncate text-xs">{result.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
