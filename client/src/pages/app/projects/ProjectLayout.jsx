import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  FolderOpen,
  Globe,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Pencil,
  Share2,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { openAi, useAiAvailable } from '../../../features/ai/aiBridge.js';
import { AI_GRADIENT } from '../../../features/ai/aiStyle.js';
import { ActionMenu } from '../../../features/files/ActionMenu.jsx';
import { ConfirmDialog } from '../../../features/files/FileDialogs.jsx';
import { useDeleteProject, useProject, useSaveProject } from '../../../features/projects/hooks.js';
import { ProjectFormDialog } from '../../../features/projects/ProjectFormDialog.jsx';
import { dueInfo } from '../../../features/projects/projectList.js';
import {
  PROJECT_STATUS_OPTIONS,
  projectTypeLabel,
} from '../../../features/projects/projectMeta.js';
import { ProjectStatusBadge } from '../../../features/projects/ProjectStatusBadge.jsx';
import { ShareProjectDialog } from '../../../features/projectShare/ShareProjectDialog.jsx';
import { canAdminister, canManage } from '../../../features/workspaces/roles.js';
import { cn } from '../../../lib/cn.js';

const TABS = [
  { to: '', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: 'files', label: 'Files', icon: FolderOpen },
  { to: 'tasks', label: 'Tasks', icon: ListChecks },
  { to: 'calendar', label: 'Calendar', icon: CalendarDays },
  { to: 'notes', label: 'Notes', icon: NotebookPen },
];

// openTasks: shown as a count on the Tasks tab.
function ProjectTabs({ openTasks }) {
  return (
    <nav
      aria-label="Project sections"
      className="-mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.label}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              'flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-colors',
              isActive
                ? 'pill-active font-medium'
                : 'border-line/70 bg-surface text-muted hover:text-ink border',
            )
          }
        >
          <tab.icon className="h-4 w-4" aria-hidden="true" />
          {tab.label}
          {tab.to === 'tasks' && openTasks > 0 && (
            <span className="text-[11px] tabular-nums opacity-70">{openTasks}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// The status as a pill that is also the control for changing it.
function StatusSelect({ project, save }) {
  return (
    <label className="border-line bg-surface focus-within:ring-accent/20 relative flex h-10 items-center rounded-full border shadow-sm focus-within:ring-4">
      <span className="sr-only">Project status</span>
      <select
        value={project.status}
        disabled={save.isPending}
        onChange={(event) => save.mutate({ id: project.id, status: event.target.value })}
        className="h-full cursor-pointer appearance-none rounded-full bg-transparent pl-4 pr-9 text-sm font-medium outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-wait"
      >
        {PROJECT_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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

const DUE_TONES = {
  danger: 'text-danger font-medium',
  warning: 'text-warning font-medium',
  muted: '',
  ink: '',
};

export function ProjectLayout() {
  const { workspace } = useOutletContext();
  const { projectId } = useParams();
  const { data: project, isPending, isError } = useProject(workspace.id, projectId);
  const [isEditing, setIsEditing] = useState(false);
  const askAi = useAiAvailable();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const deleteProject = useDeleteProject(workspace.id);
  const save = useSaveProject(workspace.id);
  const navigate = useNavigate();

  function confirmDelete() {
    deleteProject.mutate(projectId, {
      onSuccess: () => navigate(`/w/${workspace.id}/projects`, { replace: true }),
    });
  }

  if (isPending) return <Skeleton className="h-40 w-full max-w-3xl" />;
  if (isError) {
    return (
      <EmptyState title="Project not found">
        It may have been removed.{' '}
        <Link to={`/w/${workspace.id}/projects`} className="text-ink underline underline-offset-4">
          Back to projects
        </Link>
      </EmptyState>
    );
  }

  const manager = canManage(workspace);
  const due = dueInfo(project);
  const isArchived = project.status === 'archived';
  // The header keeps the two everyday controls (status and Share); the rest is in the menu.
  const moreItems = [];
  if (manager) {
    moreItems.push({
      key: 'edit',
      label: 'Edit details',
      icon: Pencil,
      onSelect: () => setIsEditing(true),
    });
    moreItems.push({
      key: 'archive',
      label: isArchived ? 'Restore from archive' : 'Archive project',
      icon: isArchived ? ArchiveRestore : Archive,
      onSelect: () => save.mutate({ id: project.id, status: isArchived ? 'active' : 'archived' }),
    });
  }
  if (canAdminister(workspace)) {
    moreItems.push({
      key: 'delete',
      label: 'Delete project',
      icon: Trash2,
      danger: true,
      divider: manager,
      onSelect: () => setIsDeleting(true),
    });
  }

  return (
    <>
      <Link
        to={`/w/${workspace.id}/projects`}
        className="text-muted hover:text-ink mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Projects
      </Link>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight tracking-tight md:text-3xl">
            {project.title}
          </h1>
          <p className="text-muted mt-2 flex flex-wrap items-center gap-2 text-sm">
            {!manager && <ProjectStatusBadge status={project.status} />}
            <span>{projectTypeLabel(project.type)}</span>
            {project.client && (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  to={`/w/${workspace.id}/clients/${project.client.id}`}
                  className="hover:text-ink underline underline-offset-4"
                >
                  {project.client.name}
                </Link>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className={DUE_TONES[due.tone]}>{due.label}</span>
            {project.sharing && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-success inline-flex items-center gap-1 font-medium">
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  {project.sharing.audience === 'anyone'
                    ? 'Shared publicly'
                    : 'Shared with signed-in users'}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {manager && <StatusSelect project={project} save={save} />}
          {askAi && (
            <Button
              variant="accent"
              onClick={() => openAi({ project: { id: project.id, title: project.title } })}
              className={cn(AI_GRADIENT, 'border-0 text-white enabled:hover:opacity-90')}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Ask AI
            </Button>
          )}
          {manager && (
            <Button variant="secondary" onClick={() => setIsSharing(true)}>
              <Share2 className="h-4 w-4" aria-hidden="true" /> Share
            </Button>
          )}
          <ActionMenu
            label="More project actions"
            title={project.title}
            items={moreItems}
            variant="toolbar"
            className="h-10 w-10"
          />
        </div>
      </header>
      {save.error && (
        <Alert tone="error" className="mb-4">
          {save.error.message}
        </Alert>
      )}
      <ProjectTabs openTasks={project.tasks.total - project.tasks.done} />
      <Outlet context={{ workspace, project, editProject: () => setIsEditing(true) }} />
      <ProjectFormDialog
        workspaceId={workspace.id}
        open={isEditing}
        onClose={() => setIsEditing(false)}
        project={project}
      />
      {manager && (
        <ShareProjectDialog
          workspaceId={workspace.id}
          project={project}
          open={isSharing}
          onClose={() => setIsSharing(false)}
        />
      )}
      <ConfirmDialog
        open={isDeleting}
        title={`Delete "${project.title}"?`}
        confirmLabel="Delete project"
        pending={deleteProject.isPending}
        error={deleteProject.error?.message}
        onConfirm={confirmDelete}
        onClose={() => {
          setIsDeleting(false);
          deleteProject.reset();
        }}
      >
        This permanently deletes the project with all of its files, folders, tasks and calendar
        events, including anything in its Trash. The space they use is freed. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
