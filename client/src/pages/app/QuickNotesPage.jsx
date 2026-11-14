import { ChevronDown, Hash, NotebookPen, X } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useProjects } from '../../features/projects/hooks.js';
import { useQuickNotes } from '../../features/quickNotes/hooks.js';
import { NoteComposer } from '../../features/quickNotes/NoteComposer.jsx';
import { NoteList } from '../../features/quickNotes/NoteList.jsx';

const SCOPES = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'shared', label: 'Team' },
];
const TOP_TAGS = 12;

function ProjectFilter({ projects, value, onChange }) {
  return (
    <label className="border-line bg-surface focus-within:ring-accent/20 relative flex h-10 items-center rounded-full border shadow-sm focus-within:ring-4">
      <span className="sr-only">Project</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full max-w-[16rem] cursor-pointer appearance-none truncate rounded-full bg-transparent pl-4 pr-9 text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
      >
        <option value="">All projects</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.title}
          </option>
        ))}
      </select>
      <ChevronDown
        className="text-muted pointer-events-none absolute right-3 h-4 w-4"
        aria-hidden="true"
      />
    </label>
  );
}

// Most used tags among the notes shown, as one-tap filters.
function TagBar({ notes, active, onSelect }) {
  const counts = new Map();
  for (const note of notes) {
    for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_TAGS);

  if (!active && tags.length === 0) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {active ? (
        <button
          type="button"
          onClick={() => onSelect('')}
          className="pill-active inline-flex h-7 items-center gap-1 rounded-full pl-3 pr-2 text-xs font-medium"
        >
          #{active}
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Clear tag filter</span>
        </button>
      ) : (
        <>
          <Hash className="text-muted h-3.5 w-3.5" aria-hidden="true" />
          {tags.map(([tag, count]) => (
            <button
              key={tag}
              type="button"
              onClick={() => onSelect(tag)}
              className="border-line/70 bg-surface text-muted hover:text-ink inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs"
            >
              {tag}
              <span className="tabular-nums opacity-60">{count}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

export function QuickNotesPage() {
  const { workspace } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  // The header search links here as ?q=<note title>: fill the box, then drop it from the URL.
  const linkedQuery = params.get('q');
  const [handledQuery, setHandledQuery] = useState(null);
  if (linkedQuery !== null && linkedQuery !== handledQuery) {
    setHandledQuery(linkedQuery);
    setSearch(linkedQuery);
  }
  if (linkedQuery === null && handledQuery !== null) setHandledQuery(null);
  useEffect(() => {
    if (linkedQuery === null) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [linkedQuery, setParams]);
  const q = useDeferredValue(search.trim());
  const scope = params.get('scope') ?? 'all';
  const projectId = params.get('project') ?? '';
  const tag = params.get('tag') ?? '';

  const { data: projects = [] } = useProjects(workspace.id);
  const {
    data: notes,
    isPending,
    isError,
    error,
  } = useQuickNotes(workspace.id, {
    scope,
    projectId: projectId || undefined,
    tag: tag || undefined,
    q: q || undefined,
  });

  function setParam(key, value) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value && !(key === 'scope' && value === 'all')) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const filtered = Boolean(q || projectId || tag || scope !== 'all');

  return (
    <>
      <PageHeader
        title="Quick notes"
        description="Catch thoughts and ideas before they slip away. Link them to projects and group them with #tags."
      />

      <div className="mb-8 max-w-3xl">
        <NoteComposer
          key={projectId || 'none'}
          workspaceId={workspace.id}
          defaultProjectIds={projectId ? [projectId] : []}
          collapsible
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Show"
          options={SCOPES}
          value={scope}
          onChange={(value) => setParam('scope', value)}
        />
        <ProjectFilter
          projects={projects}
          value={projectId}
          onChange={(value) => setParam('project', value)}
        />
        <SearchInput
          label="Search notes"
          placeholder="Search notes"
          value={search}
          onChange={setSearch}
          className="w-full sm:ml-auto sm:w-64"
        />
      </div>

      {notes && <TagBar notes={notes} active={tag} onSelect={(value) => setParam('tag', value)} />}

      {isError && <Alert tone="error">{error.message}</Alert>}
      {isPending && <Skeleton className="h-48 w-full" />}

      {notes?.length === 0 &&
        (filtered ? (
          <EmptyState title="No notes here">Nothing matches these filters.</EmptyState>
        ) : (
          <EmptyState icon={NotebookPen} title="Your ideas, in one place">
            Write a thought above, or press Alt + N anywhere in the app. Notes are private unless
            you share them with the team.
          </EmptyState>
        ))}

      {notes?.length > 0 && (
        <NoteList
          notes={notes}
          workspaceId={workspace.id}
          onTagClick={(value) => setParam('tag', value)}
        />
      )}
    </>
  );
}
