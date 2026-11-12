import {
  AlarmClock,
  ArrowDownUp,
  ChevronDown,
  CircleCheck,
  FolderKanban,
  LayoutGrid,
  List,
  Plus,
  SearchX,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
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

// "all" is everything not archived. The rest match one status each.
const TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'review', label: 'In review' },
  { value: 'pending', label: 'Waiting' },
  { value: 'draft', label: 'Draft' },
  { value: 'completed', label: 'Completed' },
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

// A number at a glance that is also a shortcut: clicking it filters the list.
function StatTile({ icon: Icon, label, value, tint, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'bg-surface shadow-soft flex items-center gap-3.5 rounded-3xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
        isActive
          ? 'border-accent/60 ring-accent/30 ring-2'
          : 'border-line/70 hover:border-accent/30',
      )}
    >
      <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', tint)}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="font-display block text-2xl tabular-nums leading-none">{value}</span>
        <span className="text-muted mt-1 block truncate text-sm">{label}</span>
      </span>
    </button>
  );
}

function StatusTabs({ value, onChange, counts }) {
  // "Draft" only earns a tab while there are drafts (or it is the open tab).
  const tabs = TABS.filter((tab) => tab.value !== 'draft' || counts.draft > 0 || value === 'draft');
  return (
    <div
      role="group"
      aria-label="Filter by status"
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

function countByTab(projects) {
  const counts = { all: projects.length };
  for (const project of projects) counts[project.status] = (counts[project.status] ?? 0) + 1;
  return counts;
}

export function ProjectsPage() {
  const { workspace } = useOutletContext();
  const navigate = useNavigate();
  const manager = canManage(workspace);
  const admin = canAdminister(workspace);
  const [tab, setTab] = useState('all');
  // "soon" | "overdue": the stat tiles' shortcuts, on top of the "all" tab.
  const [focus, setFocus] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useStoredChoice('projects:view', ['grid', 'list'], 'grid');
  const [sort, setSort] = useStoredChoice(
    'projects:sort',
    PROJECT_SORTS.map((option) => option.value),
    'due',
  );
  // The sidebar's "+" links here with ?new=1 to open the dialog straight away.
  const [searchParams, setSearchParams] = useSearchParams();
  // null | { type: "create" } | { type: "edit" | "delete", project }
  const [dialog, setDialog] = useState(() =>
    manager && searchParams.get('new') === '1' ? { type: 'create' } : null,
  );
  const save = useSaveProject(workspace.id);
  const deleteProject = useDeleteProject(workspace.id);

  // Everything not archived comes in one request and is filtered here, so the
  // tabs can show counts and switch instantly. Archived loads when asked for.
  const current = useProjects(workspace.id);
  const archived = useProjects(
    workspace.id,
    { status: 'archived' },
    { enabled: tab === 'archived' },
  );
  const source = tab === 'archived' ? archived : current;
  const all = current.data ?? [];

  function closeDialog() {
    setDialog(null);
    deleteProject.reset();
    if (searchParams.has('new')) setSearchParams({}, { replace: true });
  }

  function chooseTab(next) {
    setTab(next);
    setFocus(null);
  }

  function chooseFocus(next) {
    setTab('all');
    setFocus(focus === next ? null : next);
  }

  function onAction(action, project, value) {
    if (action === 'open') navigate(`/w/${workspace.id}/projects/${project.id}`);
    else if (action === 'status') save.mutate({ id: project.id, status: value });
    else setDialog({ type: action, project });
  }

  const needle = search.trim().toLowerCase();
  const inTab = (source.data ?? []).filter((project) => {
    if (tab !== 'all' && tab !== 'archived' && project.status !== tab) return false;
    if (focus === 'soon' && !isProjectDueSoon(project)) return false;
    if (focus === 'overdue' && !isProjectOverdue(project)) return false;
    return true;
  });
  const shown = sortProjects(
    inTab.filter((project) => matchesSearch(project, needle)),
    sort,
  );
  const isFiltered = tab !== 'all' || focus !== null || needle !== '';
  const menu = { canManage: manager, canDelete: admin, onAction };
  const create = () => setDialog({ type: 'create' });

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every piece of client work, with its tasks, schedule and files."
        actions={
          manager && (
            <Button onClick={create}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New project
            </Button>
          )
        }
      />

      {all.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon={FolderKanban}
            label="In progress"
            value={all.filter(isProjectOpen).length}
            tint="bg-lavender text-accent dark:text-ink"
            isActive={tab === 'all' && focus === null}
            onClick={() => chooseTab('all')}
          />
          <StatTile
            icon={AlarmClock}
            label="Due this week"
            value={all.filter(isProjectDueSoon).length}
            tint="bg-peach text-ink"
            isActive={focus === 'soon'}
            onClick={() => chooseFocus('soon')}
          />
          <StatTile
            icon={TriangleAlert}
            label="Overdue"
            value={all.filter(isProjectOverdue).length}
            tint="bg-pink text-ink"
            isActive={focus === 'overdue'}
            onClick={() => chooseFocus('overdue')}
          />
          <StatTile
            icon={CircleCheck}
            label="Completed"
            value={all.filter((project) => project.status === 'completed').length}
            tint="bg-mint text-ink"
            isActive={tab === 'completed'}
            onClick={() => chooseTab('completed')}
          />
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusTabs value={tab} onChange={chooseTab} counts={countByTab(all)} />
        <div className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto">
          <SearchInput
            label="Search projects"
            placeholder="Search title, client or tag"
            value={search}
            onChange={setSearch}
            className="min-w-0 flex-1 lg:w-64 lg:flex-none"
          />
          <SortSelect value={sort} onChange={setSort} />
          <SegmentedControl label="View" options={VIEW_OPTIONS} value={view} onChange={setView} />
        </div>
      </div>

      {save.error && (
        <Alert tone="error" className="mb-4">
          {save.error.message}
        </Alert>
      )}
      {source.isError && <Alert tone="error">{source.error.message}</Alert>}
      {source.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-3xl" />
          ))}
        </div>
      )}

      {source.isSuccess &&
        shown.length === 0 &&
        (isFiltered ? (
          <EmptyState
            icon={SearchX}
            title="No projects match"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  chooseTab('all');
                  setSearch('');
                }}
              >
                Show all projects
              </Button>
            }
          >
            Nothing fits this filter{needle ? ' and search' : ''} right now.
          </EmptyState>
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="Start your first project"
            action={manager && <Button onClick={create}>New project</Button>}
          >
            A project holds the brief, tasks, schedule and every file for one piece of client work.
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
        open={dialog?.type === 'create' || dialog?.type === 'edit'}
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
