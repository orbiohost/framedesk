import { Check, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { formatDueLabel, isOverdue } from '../../lib/dates.js';
import { useMoveTask, useTasks } from '../tasks/hooks.js';
import { PriorityChip } from './TaskChips.jsx';
import { Widget } from './Widget.jsx';

function byDueDate(a, b) {
  return new Date(a.dueDate ?? 8.64e15) - new Date(b.dueDate ?? 8.64e15);
}

// My open tasks, soonest first, ticked off in one click.
export function MyTasksWidget({ workspace, canEdit, onOpen, className }) {
  const { data: tasks, isPending } = useTasks(workspace.id, { assignee: 'me' });
  const move = useMoveTask(workspace.id);
  const open = (tasks ?? []).filter((task) => task.status !== 'done').sort(byDueDate);

  return (
    <Widget
      icon={ListChecks}
      title="My tasks"
      className={className}
      actions={
        <Link
          to={`/w/${workspace.id}/tasks`}
          className="bg-subtle hover:bg-line/70 rounded-full px-3 py-1.5 text-xs font-medium"
        >
          All
        </Link>
      }
    >
      {isPending && <Skeleton className="h-32" />}
      {!isPending && open.length === 0 && (
        <p className="text-muted py-6 text-center text-sm">Nothing assigned to you. Enjoy it 🎉</p>
      )}
      <ul className="space-y-1.5">
        {open.map((task) => {
          const overdue = isOverdue(task.dueDate);
          return (
            <li
              key={task.id}
              className="hover:bg-subtle/70 flex items-center gap-3 rounded-2xl px-2 py-2"
            >
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => move.mutate({ taskId: task.id, change: { status: 'done' } })}
                aria-label={`Mark ${task.title} as done`}
                className="border-line hover:border-success hover:bg-mint group grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors disabled:opacity-50"
              >
                <Check
                  className="text-success h-3.5 w-3.5 opacity-0 group-hover:opacity-100"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={() => onOpen(task)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">{task.title}</span>
                <span className="text-muted block truncate text-xs">
                  {task.project?.title ?? 'Personal'}
                </span>
              </button>
              {task.dueDate && (
                <span
                  className={cn(
                    'shrink-0 text-xs tabular-nums',
                    overdue ? 'text-danger font-semibold' : 'text-muted',
                  )}
                >
                  {overdue ? 'Overdue' : formatDueLabel(task.dueDate)}
                </span>
              )}
              <span className="hidden shrink-0 2xl:block">
                <PriorityChip priority={task.priority} />
              </span>
            </li>
          );
        })}
      </ul>
      {move.error && <p className="text-danger mt-2 text-xs">{move.error.message}</p>}
    </Widget>
  );
}
