import { format } from 'date-fns';
import { ChevronRight, Crown, Plus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AvatarStack } from '../../components/ui/Avatar.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useCurrentUser } from '../../features/auth/hooks.js';
import { DashboardGrid, EditBar } from '../../features/dashboard/DashboardGrid.jsx';
import {
  useDashboardLayout,
  useSaveDashboardLayout,
} from '../../features/dashboard/layoutHooks.js';
import { useMembers } from '../../features/members/hooks.js';
import { useTasks } from '../../features/tasks/hooks.js';
import { TaskFormDialog } from '../../features/tasks/TaskFormDialog.jsx';
import { planLabel } from '../../features/workspaces/planLabel.js';
import { canEdit, canView } from '../../features/workspaces/roles.js';
import { cn } from '../../lib/cn.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function DashboardHeader({ workspace, firstName, updatedAt, onAdd, editing, onCustomize }) {
  const { data: members = [] } = useMembers(workspace.id);
  // The header shows the studio team; clients are guests, not teammates.
  const team = members.filter((member) => member.role !== 'client');

  return (
    <header className="short:mb-3 mb-5">
      <div className="text-muted flex flex-wrap items-center justify-between gap-2 text-xs">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
          <span>Workspace</span>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="truncate">{workspace.name}</span>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-ink font-medium">Dashboard</span>
        </nav>
        {updatedAt > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="bg-success h-1.5 w-1.5 rounded-full" aria-hidden="true" />
            Last update {format(updatedAt, 'd MMM yyyy – h:mm a')}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display short:text-[28px] text-2xl leading-tight sm:text-3xl md:text-[34px]">
              {workspace.name} dashboard
            </h1>
            <span className="bg-lavender text-ink inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
              <Crown className="text-accent dark:text-ink h-3.5 w-3.5" aria-hidden="true" />
              {planLabel(workspace.billing)}
            </span>
          </div>
          <p className="text-muted mt-1 text-sm">
            {greeting()}, {firstName}. Here&apos;s what&apos;s moving today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {team.length > 0 && (
            <AvatarStack people={team} max={4} />
          )}
          <button
            type="button"
            onClick={onCustomize}
            aria-pressed={editing}
            className={cn(
              'flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors',
              editing
                ? 'bg-lavender text-ink'
                : 'bg-surface shadow-soft border-line/60 hover:bg-subtle border',
            )}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Customize
          </button>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="pill-active flex items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5 text-sm font-medium hover:opacity-90"
            >
              Add task
              <span className="bg-surface/20 grid h-7 w-7 place-items-center rounded-full">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function WorkspaceHomePage() {
  const { workspace } = useOutletContext();
  const { data: user } = useCurrentUser();
  const firstName = user?.name.split(' ')[0];
  const team = canView(workspace);
  const editable = canEdit(workspace);
  const tasksQuery = useTasks(workspace.id, {}, { enabled: team });
  const layout = useDashboardLayout(workspace.id);
  const saveLayout = useSaveDashboardLayout(workspace.id);
  const [dialog, setDialog] = useState(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!team) {
    return (
      <>
        <PageHeader title={workspace.name} />
        <EmptyState title={`Welcome, ${firstName}`}>
          When the studio shares a cut or a set of files for your review, the link will open it
          directly.
        </EmptyState>
      </>
    );
  }

  const ctx = {
    workspace,
    tasks: tasksQuery.data,
    tasksPending: tasksQuery.isPending,
    editable,
    openNew: (status = 'todo') => setDialog({ task: null, defaults: { status } }),
    openTask: (task) => setDialog({ task, defaults: {} }),
  };

  return (
    // On large screens the dashboard fits the window: the page never scrolls,
    // each widget scrolls inside itself. Smaller screens scroll as a normal page.
    <div className="fit:min-h-0 fit:flex-1 flex flex-col">
      <DashboardHeader
        workspace={workspace}
        firstName={firstName}
        updatedAt={tasksQuery.dataUpdatedAt}
        onAdd={editable ? () => ctx.openNew() : null}
        editing={editing}
        onCustomize={() => setEditing(!editing)}
      />

      {editing && (
        <EditBar
          onAdd={() => setAdding(true)}
          onReset={() => saveLayout.mutate(null)}
          onDone={() => setEditing(false)}
          canReset={layout.isCustomized}
          error={saveLayout.error && `Couldn't save: ${saveLayout.error.message}`}
        />
      )}

      {layout.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-72 rounded-[28px]" />
          <Skeleton className="h-72 rounded-[28px]" />
        </div>
      ) : (
        <DashboardGrid
          widgets={layout.widgets}
          editing={editing}
          onChange={(widgets) => saveLayout.mutate(widgets)}
          ctx={ctx}
          adding={adding}
          setAdding={setAdding}
        />
      )}

      <TaskFormDialog
        workspaceId={workspace.id}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        task={dialog?.task}
        defaults={dialog?.defaults}
        canEdit={editable}
      />
    </div>
  );
}
