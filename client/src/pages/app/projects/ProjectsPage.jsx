import { ArrowDownUp, ChevronDown, FolderKanban, LayoutGrid, List, Plus, SearchX } from 'lucide-react';
import { useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../../components/ui/PageHeader.jsx';
import { SearchInput } from '../../../components/ui/SearchInput.jsx';
import { SegmentedControl } from '../../../components/ui/SegmentedControl.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { ConfirmDialog } from '../../../features/files/FileDialogs.jsx';
import { useDeleteProject, useProjects, useSaveProject } from '../../../features/projects/hooks.js';
import { ProjectFormDialog } from '../../../features/projects/ProjectFormDialog.jsx';
import {
  isProjectDueSoon,
  isProjectOverdue,
  matchesSearch,
  PROJECT_SORTS,
  sortProjects,
} from '../../../features/projects/projectList.js';
import { isProjectOpen } from '../../../features/projects/projectMeta.js';
import { ProjectGrid, ProjectList } from '../../../features/projects/ProjectViews.jsx';
import { canAdminister, canManage } from '../../../features/workspaces/roles.js';
import { cn } from '../../../lib/cn.js';
import { readLocal, writeLocal } from '../../../lib/storage.js';

// One row of filters. "Open" is the default: work still to be delivered.
// `onlyWhenAny` filters stay hidden until there is something in them.
const FILTERS = [
  { value: 'open', label: 'Open', test: isProjectOpen },
  { value: 'overdue', label: 'Overdue', test: isProjectOverdue, onlyWhenAny: true, alert: true },
  { value: 'soon', label: 'Due this week', test: isProjectDueSoon, onlyWhenAny: true },
  { value: 'completed', label: 'Completed', test: (project) => project.status === 'completed' },
  // Archived projects load separately, so they have no count and no test.
  { value: 'archived', label: 'Archived' },
];

const VIEW_OPTIONS = [
  { value: 'grid', label: <span className="sr-only sm:not-sr-only">Grid</span>, icon: LayoutGrid },
  { value: 'list', label: <span className="sr-only sm:not-sr-only">List</span>, icon: List },
];

// A choice remembered in this browser, limited to the allowed values.
function useStoredChoice(key, allowed, fallback) {
  const [value, setValue] = useState(() => {
    const saved = readLocal(key);
    return allowed.includes(saved) ? saved : fallback;
  });
  const change = (next) => {
    setValue(next);
    writeLocal(key, next);
  };
  return [value, change];
}

function FilterTabs({ value, onChange, counts }) {
  const tabs = FILTERS.filter(
    (filter) => !filter.onlyWhenAny || counts[filter.value] > 0 || value === filter.value,
  );
  return (
    <div
      role="group"
      aria-label="Filter projects"
      className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const isActive = tab.value === value;
        const count = counts[tab.value];
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(tab.value)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm transition-colors',
              isActive
                ? 'pill-active font-medium'
                : 'border-line/70 bg-surface text-muted hover:text-ink border',
            )}
          >
            {tab.alert && !isActive && (
              <span className="bg-danger h-1.5 w-1.5 rounded-full" aria-hidden="true" />
            )}
            {tab.label}
            {count !== undefined && (
              <span className="text-[11px] tabular-nums opacity-70">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SortSelect({ value, onChange }) {
  return (
    <label className="border-line bg-surface text-muted focus-within:ring-accent/20 relative flex h-10 shrink-0 items-center rounded-full border focus-within:ring-4">
      <ArrowDownUp
        className="pointer-events-none absolute left-3.5 h-3.5 w-3.5"
        aria-hidden="true"
      />
      <ChevronDown
        className="pointer-events-none absolute right-3 h-3.5 w-3.5"
        aria-hidden="true"
      />
      <span className="sr-only">Sort projects</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-ink h-full cursor-pointer appearance-none rounded-full bg-transparent pl-9 pr-9 text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
      >
        {PROJECT_SORTS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function countByFilter(projects) {
  const counts = {};
  for (const filter of FILTERS) {
    if (filter.test) counts[filter.value] = projects.filter(filter.test).length;
  }
  return counts;
}

export function ProjectsPage() {
  const { workspace } = useOutletContext();
  const manager = canManage(workspace);
  const admin = canAdminister(workspace);
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [view, setView] = useStoredChoice('projects:view', ['grid', 'list'], 'grid');
  const [sort, setSort] = useStoredChoice(
    'projects:sort',
    PROJECT_SORTS.map((option) => option.value),
    'due',
  );
  // The sidebar's "+" links here with ?new=1. Read on every render, so it also
  // works when this page is already open.
  const [searchParams, setSearchParams] = useSearchParams();
  const wantsNew = manager && searchParams.get('new') === '1';
  // null | { type: "create" } | { type: "edit" | "delete", project }
  const [dialog, setDialog] = useState(null);
  const save = useSaveProject(workspace.id);
  const deleteProject = useDeleteProject(workspace.id);

  // Everything not archived comes in one request and is filtered here, so the
  // filters can show counts and switch instantly. Archived loads when asked for.
  const current = useProjects(workspace.id);
  const archived = useProjects(
    workspace.id,
    { status: 'archived' },
    { enabled: filter === 'archived' },
  );
  const source = filter === 'archived' ? archived : current;
  const all = current.data ?? [];

  function closeDialog() {
    setDialog(null);
    deleteProject.reset();
    if (searchParams.has('new')) setSearchParams({}, { replace: true });
  }

  function onAction(action, project, value) {
    if (action === 'status') save.mutate({ id: project.id, status: value });
    else setDialog({ type: action, project });
  }

  const needle = search.trim().toLowerCase();
  const test = FILTERS.find((candidate) => candidate.value === filter).test;
  const shown = sortProjects(
    (source.data ?? []).filter(
      (project) => (!test || test(project)) && matchesSearch(project, needle),
    ),
    sort,
  );
  // Nothing at all yet (not even finished work): invite the first project.
  const isBrandNew = current.isSuccess && all.length === 0 && filter === 'open' && !needle;
  const menu = { canManage: manager, canDelete: admin, onAction };
  const create = () => setDialog({ type: 'create' });

  return (
    <>
      <PageHeader
        title="Projects"
        actions={
          manager && (
            <Button onClick={create}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New project
            </Button>
          )
        }
      />

      {!isBrandNew && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <FilterTabs value={filter} onChange={setFilter} counts={countByFilter(all)} />
          <div className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto">
            <SearchInput
              label="Search projects"
              placeholder="Search title, client, status or tag"
              value={search}
              onChange={setSearch}
              className="min-w-0 flex-1 lg:w-64 lg:flex-none"
            />
            <SortSelect value={sort} onChange={setSort} />
            <SegmentedControl label="View" options={VIEW_OPTIONS} value={view} onChange={setView} />
          </div>
        </div>
      )}

      {save.error && (
        <Alert tone="error" className="mb-4">
          {save.error.message}
        </Alert>
      )}
      {source.isError && <Alert tone="error">{source.error.message}</Alert>}
      {source.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
      )}

      {source.isSuccess &&
        shown.length === 0 &&
        (isBrandNew ? (
          <EmptyState
            icon={FolderKanban}
            title="Start your first project"
            action={manager && <Button onClick={create}>New project</Button>}
          >
            A project holds the brief, tasks, schedule and every file for one piece of client work.
          </EmptyState>
        ) : (
          <EmptyState
            icon={SearchX}
            title={needle ? 'No projects match' : 'Nothing here right now'}
            action={
              (needle || filter !== 'open') && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilter('open');
                    setSearch('');
                  }}
                >
                  Show open projects
                </Button>
              )
            }
          >
            {needle
              ? 'Try a different search, or look under another filter.'
              : filter === 'open'
                ? 'Every project is finished. You can find them under Completed.'
                : 'No projects fit this filter.'}
          </EmptyState>
        ))}

      {shown.length > 0 &&
        (view === 'grid' ? (
          <ProjectGrid projects={shown} workspaceId={workspace.id} menu={menu} />
        ) : (
          <ProjectList projects={shown} workspaceId={workspace.id} menu={menu} />
        ))}

      <ProjectFormDialog
        workspaceId={workspace.id}
        open={wantsNew || dialog?.type === 'create' || dialog?.type === 'edit'}
        onClose={closeDialog}
        project={dialog?.type === 'edit' ? dialog.project : undefined}
      />
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title={`Delete "${dialog?.project?.title ?? ''}"?`}
        confirmLabel="Delete project"
        pending={deleteProject.isPending}
        error={deleteProject.error?.message}
        onConfirm={() => deleteProject.mutate(dialog.project.id, { onSuccess: closeDialog })}
        onClose={closeDialog}
      >
        This permanently deletes the project with all of its files, folders, tasks and calendar
        events, including anything in its Trash. The space they use is freed. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
