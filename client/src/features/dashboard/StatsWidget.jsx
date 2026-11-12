import { addDays, isBefore, startOfDay, subDays } from 'date-fns';
import { AlarmClock, CircleCheckBig, FolderKanban, ListTodo, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { isOverdue } from '../../lib/dates.js';
import { useProjects } from '../projects/hooks.js';
import { Widget } from './Widget.jsx';

const OPEN_PROJECT_STATUSES = ['draft', 'active', 'pending', 'review'];

function countStats(tasks = [], projects = []) {
  const today = startOfDay(new Date());
  const weekAhead = addDays(today, 7);
  const weekAgo = subDays(today, 7);
  const open = tasks.filter((task) => task.status !== 'done');

  return {
    open: open.length,
    overdue: open.filter((task) => isOverdue(task.dueDate)).length,
    dueSoon: open.filter(
      (task) =>
        task.dueDate && !isOverdue(task.dueDate) && isBefore(new Date(task.dueDate), weekAhead),
    ).length,
    doneThisWeek: tasks.filter(
      (task) => task.status === 'done' && task.completedAt && new Date(task.completedAt) >= weekAgo,
    ).length,
    activeProjects: projects.filter((project) => OPEN_PROJECT_STATUSES.includes(project.status))
      .length,
  };
}

function Tile({ icon: Icon, label, value, tint, alert }) {
  return (
    <div className="bg-subtle/70 flex min-w-0 items-center gap-3 rounded-2xl p-3">
      <span
        className={cn(
          'text-ink grid h-10 w-10 shrink-0 place-items-center rounded-full',
          alert ? 'bg-danger text-white' : tint,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-2xl tabular-nums leading-none">{value}</p>
        <p className="text-muted mt-1 truncate text-xs">{label}</p>
      </div>
    </div>
  );
}

// Workspace health at a glance.
export function StatsWidget({ workspace, tasks, className }) {
  const { data: projects } = useProjects(workspace.id);
  const stats = countStats(tasks, projects);

  return (
    <Widget icon={ListTodo} title="Overview" className={className}>
      {/* Tiles wrap to whatever width the widget is given. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2.5">
        <Tile icon={ListTodo} label="Open tasks" value={stats.open} tint="bg-lavender" />
        <Tile
          icon={TriangleAlert}
          label="Overdue"
          value={stats.overdue}
          tint="bg-pink"
          alert={stats.overdue > 0}
        />
        <Tile icon={AlarmClock} label="Due this week" value={stats.dueSoon} tint="bg-peach" />
        <Tile
          icon={CircleCheckBig}
          label="Done this week"
          value={stats.doneThisWeek}
          tint="bg-mint"
        />
        <Tile
          icon={FolderKanban}
          label="Active projects"
          value={stats.activeProjects}
          tint="bg-lavender"
        />
      </div>
    </Widget>
  );
}
