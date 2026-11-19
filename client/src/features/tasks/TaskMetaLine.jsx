import { CalendarDays, ListChecks, Repeat } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { cn } from '../../lib/cn.js';
import { formatDueLabel, isOverdue } from '../../lib/dates.js';
import { isPressingPriority, priorityLabel } from '../../lib/priorities.js';
import { repeatLabel } from './taskMeta.js';

// Due date, checklist progress, priority and assignee, in one compact row.
export function TaskMetaLine({ task, className }) {
  const overdue = task.status !== 'done' && isOverdue(task.dueDate);
  const checklistDone = task.checklist.filter((item) => item.done).length;

  return (
    <div
      className={cn('text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}
    >
      {task.dueDate && (
        <span className={cn('flex items-center gap-1', overdue && 'text-danger font-medium')}>
          <CalendarDays className="h-3 w-3" aria-hidden="true" />
          {overdue ? `Overdue · ${formatDueLabel(task.dueDate)}` : formatDueLabel(task.dueDate)}
        </span>
      )}
      {task.repeat && (
        <span className="flex items-center" title={repeatLabel(task.repeat)}>
          <Repeat className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">{repeatLabel(task.repeat)}</span>
        </span>
      )}
      {task.checklist.length > 0 && (
        <span className="flex items-center gap-1 tabular-nums">
          <ListChecks className="h-3 w-3" aria-hidden="true" />
          {checklistDone}/{task.checklist.length}
        </span>
      )}
      {isPressingPriority(task.priority) && (
        <span className="text-accent font-medium">{priorityLabel(task.priority)}</span>
      )}
      {task.assignee && (
        <Avatar
          name={task.assignee.name}
          src={task.assignee.avatarUrl}
          size="sm"
          className="ml-auto"
        />
      )}
    </div>
  );
}
