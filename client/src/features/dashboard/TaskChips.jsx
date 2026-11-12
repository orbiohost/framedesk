import { Clock, Flame } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { formatDueLabel, isOverdue } from '../../lib/dates.js';

const PRIORITY_CHIPS = {
  urgent: {
    label: 'Urgent',
    className: 'bg-gradient-to-r from-orange-400 to-red-500 text-white shadow-sm',
    icon: Flame,
  },
  high: {
    label: 'High priority',
    className: 'bg-pink text-danger dark:text-ink',
    dot: 'bg-danger',
  },
  medium: { label: 'Medium', className: 'bg-peach text-ink', dot: 'bg-warning' },
  low: { label: 'Low priority', className: 'bg-mint text-ink', dot: 'bg-success' },
};

const CHIP = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium';

export function PriorityChip({ priority }) {
  const chip = PRIORITY_CHIPS[priority] ?? PRIORITY_CHIPS.medium;
  const Icon = chip.icon;
  return (
    <span className={cn(CHIP, chip.className)}>
      {Icon ? (
        <Icon className="h-3 w-3" aria-hidden="true" />
      ) : (
        <span className={cn('h-2 w-2 rounded-full', chip.dot)} aria-hidden="true" />
      )}
      {chip.label}
    </span>
  );
}

export function DueChip({ task }) {
  if (!task.dueDate) return null;
  const overdue = task.status !== 'done' && isOverdue(task.dueDate);
  return (
    <span
      className={cn(
        CHIP,
        overdue
          ? 'bg-danger text-white'
          : 'from-pink to-pink/60 text-danger dark:text-ink bg-gradient-to-r',
      )}
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      {overdue ? 'Overdue' : 'Due'} {formatDueLabel(task.dueDate)}
    </span>
  );
}
