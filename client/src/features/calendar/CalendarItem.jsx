import { cn } from '../../lib/cn.js';
import { formatTime } from '../../lib/dates.js';
import { isDeadline, itemLabel } from './calendarMeta.js';

// Same pastels as the dashboard calendar.
function toneClass(item) {
  if (isDeadline(item)) return 'bg-pink';
  if (item.type === 'meeting' || item.type === 'review_call') return 'bg-lavender';
  if (item.type === 'shoot') return 'bg-peach';
  if (item.kind === 'task_due') return 'bg-mint';
  return 'bg-subtle';
}

function timeLabel(item) {
  return item.allDay ? null : formatTime(item.startsAt);
}

export function CalendarItem({ item, onOpen, compact = false }) {
  const done = item.status === 'done' || item.status === 'completed';
  const time = timeLabel(item);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(item);
      }}
      title={`${itemLabel(item)}: ${item.title}`}
      className={cn(
        'block w-full truncate rounded-full px-2 py-0.5 text-left text-xs transition-opacity hover:opacity-80',
        toneClass(item),
        done && 'text-muted line-through',
      )}
    >
      {time && <span className="text-muted mr-1 tabular-nums">{time}</span>}
      {item.title}
      {!compact && <span className="text-muted ml-1">· {itemLabel(item)}</span>}
    </button>
  );
}
