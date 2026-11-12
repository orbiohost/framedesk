import { FolderKanban, ListTodo, Search, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '../features/clients/hooks.js';
import { useProjects } from '../features/projects/hooks.js';
import { useTasks } from '../features/tasks/hooks.js';
import { cn } from '../lib/cn.js';
import { useDismiss } from '../lib/useDismiss.js';

const PER_GROUP = 5;
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function matches(text, query) {
  return text?.toLowerCase().includes(query);
}

// Searches the projects, clients and tasks already loaded for this workspace.
function useResults(workspaceId, query) {
  const { data: projects = [] } = useProjects(workspaceId);
  const { data: clients = [] } = useClients(workspaceId);
  const { data: tasks = [] } = useTasks(workspaceId);

  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const base = `/w/${workspaceId}`;
    return [
      ...projects
        .filter((project) => matches(project.title, q) || matches(project.client?.name, q))
        .slice(0, PER_GROUP)
        .map((project) => ({
          id: `p-${project.id}`,
          icon: FolderKanban,
          label: project.title,
          hint: project.client?.name ?? 'Project',
          to: `${base}/projects/${project.id}`,
        })),
      ...clients
        .filter((client) => matches(client.name, q) || matches(client.company, q))
        .slice(0, PER_GROUP)
        .map((client) => ({
          id: `c-${client.id}`,
          icon: Users,
          label: client.name,
          hint: client.company ?? 'Client',
          to: `${base}/clients/${client.id}`,
        })),
      ...tasks
        .filter((task) => matches(task.title, q))
        .slice(0, PER_GROUP)
        .map((task) => ({
          id: `t-${task.id}`,
          icon: ListTodo,
          label: task.title,
          hint: task.project?.title ?? 'Task',
          to: task.project ? `${base}/projects/${task.project.id}/tasks` : `${base}/tasks`,
        })),
    ];
  }, [workspaceId, query, projects, clients, tasks]);
}

export function GlobalSearch({ workspaceId, className }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(containerRef, isOpen, close);
  const results = useResults(workspaceId, query);

  // Ctrl+K / Cmd+K focuses the search from anywhere.
  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function go(result) {
    navigate(result.to);
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
    }
  }

  const showPanel = isOpen && query.trim().length > 0;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <label className="bg-subtle focus-within:bg-surface focus-within:ring-accent/40 flex h-11 items-center gap-2.5 rounded-full px-4 transition-colors focus-within:ring-2">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">Search projects, clients and tasks</span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search here..."
          className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <kbd className="text-muted hidden shrink-0 text-xs font-medium sm:block">
          {IS_MAC ? '⌘K' : 'Ctrl K'}
        </kbd>
      </label>

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          className="border-line/70 bg-surface shadow-lift absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-2xl border p-1.5"
        >
          {results.length === 0 && (
            <p className="text-muted px-3 py-4 text-sm">Nothing matches “{query.trim()}”.</p>
          )}
          {results.map((result, index) => {
            const Icon = result.icon;
            return (
              <button
                key={result.id}
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => go(result)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left',
                  index === highlight && 'bg-subtle',
                )}
              >
                <span className="bg-lavender text-accent dark:text-ink grid h-8 w-8 shrink-0 place-items-center rounded-full">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{result.label}</span>
                  <span className="text-muted block truncate text-xs">{result.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
