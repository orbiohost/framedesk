import { Check, FolderKanban, Plus, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { useDismiss } from '../../lib/useDismiss.js';
import { useProjects } from '../projects/hooks.js';

export const MAX_NOTE_PROJECTS = 10;

// The chips for linked projects plus a searchable "Link project" popover.
// exclude: project ids not offered (e.g. the project a file already lives in).
export function ProjectPicker({
  workspaceId,
  value,
  onChange,
  max = MAX_NOTE_PROJECTS,
  exclude = [],
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);
  useDismiss(containerRef, isOpen, close);
  const { data: projects = [] } = useProjects(workspaceId);

  const byId = new Map(projects.map((project) => [project.id, project]));
  const q = search.trim().toLowerCase();
  const matches = projects
    .filter((project) => !exclude.includes(project.id))
    .filter((project) => project.status !== 'archived' || value.includes(project.id))
    .filter((project) => !q || project.title.toLowerCase().includes(q))
    .slice(0, 50);

  function toggle(id) {
    if (value.includes(id)) onChange(value.filter((other) => other !== id));
    else if (value.length < max) onChange([...value, id]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((id) => (
        <span
          key={id}
          className="bg-lavender text-ink inline-flex max-w-[14rem] items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium"
        >
          <FolderKanban className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{byId.get(id)?.title ?? 'Project'}</span>
          <button
            type="button"
            onClick={() => toggle(id)}
            aria-label={`Unlink ${byId.get(id)?.title ?? 'project'}`}
            className="hover:bg-surface/60 grid h-4 w-4 place-items-center rounded-full"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}

      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => (isOpen ? close() : setIsOpen(true))}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="text-muted hover:text-ink hover:bg-subtle inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {value.length ? 'Project' : 'Link to project'}
        </button>

        {isOpen && (
          <div className="border-line/70 bg-surface shadow-lift absolute left-0 top-full z-30 mt-1.5 w-64 rounded-2xl border p-1.5">
            <input
              type="search"
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
              }}
              placeholder="Find a project"
              aria-label="Find a project"
              className="border-line bg-bg placeholder:text-muted/70 focus-visible:border-accent/60 focus-visible:ring-accent/15 mb-1 h-9 w-full rounded-xl border px-3 text-sm transition-shadow focus-visible:ring-[3px]"
            />
            <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto">
              {matches.length === 0 && (
                <li className="text-muted px-2.5 py-2 text-xs">No projects match</li>
              )}
              {matches.map((project) => {
                const selected = value.includes(project.id);
                const full = !selected && value.length >= max;
                return (
                  <li key={project.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      disabled={full}
                      onClick={() => toggle(project.id)}
                      className={cn(
                        'hover:bg-subtle flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm disabled:opacity-50',
                        selected && 'font-medium',
                      )}
                    >
                      <span className="truncate">{project.title}</span>
                      {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
