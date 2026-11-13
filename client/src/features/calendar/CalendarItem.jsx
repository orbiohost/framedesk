import { isSameDay } from 'date-fns';
import {
  CalendarDays,
  Camera,
  CircleCheck,
  Flag,
  FolderKanban,
  MapPin,
  Users,
  Video,
} from 'lucide-react';
import { createElement } from 'react';
import { cn } from '../../lib/cn.js';
import { formatTime } from '../../lib/dates.js';
import { isDeadline, itemLabel } from './calendarMeta.js';

// Same pastels as the dashboard calendar.
export function itemTone(item) {
  if (isDeadline(item)) return 'bg-pink';
  if (item.type === 'meeting' || item.type === 'review_call') return 'bg-lavender';
  if (item.type === 'shoot') return 'bg-peach';
  if (item.kind === 'task_due') return 'bg-mint';
  return 'bg-subtle';
}

function itemIcon(item) {
  if (item.kind === 'project_due') return FolderKanban;
  if (item.kind === 'task_due') return CircleCheck;
  if (item.type === 'shoot') return Camera;
  if (item.type === 'meeting') return Users;
  if (item.type === 'review_call') return Video;
  if (item.type === 'delivery') return Flag;
  return CalendarDays;
}

function isDone(item) {
  return item.status === 'done' || item.status === 'completed';
}

// "10:00 AM – 11:30 AM" for a timed event on `day`; nothing for due dates.
function timeRange(item, day) {
  if (item.kind !== 'event') return null;
  if (item.allDay) return 'All day';
  const start = new Date(item.startsAt);
  const end = new Date(item.endsAt);
  const startsToday = !day || isSameDay(day, start);
  const endsToday = !day || isSameDay(day, end);
  if (startsToday && endsToday) {
    return end > start ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
  }
  if (startsToday) return `From ${formatTime(start)}`;
  if (endsToday) return `Until ${formatTime(end)}`;
  return 'All day';
}

/**
 * One calendar entry.
 * compact: a one-line chip for month and week cells.
 * otherwise: a full row with its type, time, project and place.
 * day: the day it is drawn on, so a multi-day event shows its time only where it starts.
 */
export function CalendarItem({ item, onOpen, day, compact = false }) {
  const done = isDone(item);
  const open = (event) => {
    event.stopPropagation();
    onOpen(item);
  };

  if (compact) {
    const showTime = !item.allDay && (!day || isSameDay(day, new Date(item.startsAt)));
    return (
      <button
        type="button"
        onClick={open}
        onDoubleClick={(event) => event.stopPropagation()}
        title={`${itemLabel(item)}: ${item.title}`}
        className={cn(
          'text-ink block w-full truncate rounded-sm px-1.5 py-0.5 text-left text-xs transition-opacity hover:opacity-75',
          itemTone(item),
          done && 'line-through opacity-60',
        )}
      >
        {showTime && (
          <span className="mr-1 tabular-nums opacity-70">{formatTime(item.startsAt)}</span>
        )}
        {item.title}
      </button>
    );
  }

  const details = [itemLabel(item), timeRange(item, day), item.project?.title].filter(Boolean);
  return (
    <button
      type="button"
      onClick={open}
      className="hover:bg-subtle/70 flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors"
    >
      <span
        className={cn(
          'text-ink grid h-9 w-9 shrink-0 place-items-center rounded-xl',
          itemTone(item),
        )}
      >
        {createElement(itemIcon(item), { className: 'h-4 w-4', 'aria-hidden': true })}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-medium', done && 'text-muted line-through')}>
          {item.title}
        </span>
        <span className="text-muted block truncate text-xs">{details.join(' · ')}</span>
        {item.location && (
          <span className="text-muted mt-0.5 flex items-center gap-1 text-xs">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.location}</span>
          </span>
        )}
      </span>
    </button>
  );
}
