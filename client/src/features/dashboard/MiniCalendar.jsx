import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { dayKey, formatTime } from '../../lib/dates.js';
import { groupItemsByDay, itemLabel } from '../calendar/calendarMeta.js';
import { useCalendarFeed } from '../calendar/hooks.js';
import { RoundIconButton, Widget } from './Widget.jsx';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Strongest signal wins when a day holds several kinds of item.
const TONES = [
  {
    key: 'deadline',
    label: 'Deadline',
    test: (item) => item.kind === 'project_due' || item.type === 'delivery',
    band: 'bg-pink/60',
    dot: 'bg-pink',
  },
  {
    key: 'meeting',
    label: 'Meeting',
    test: (item) => item.type === 'meeting' || item.type === 'review_call',
    band: 'bg-lavender/60',
    dot: 'bg-lavender',
  },
  {
    key: 'shoot',
    label: 'Shoot',
    test: (item) => item.type === 'shoot',
    band: 'bg-peach/70',
    dot: 'bg-peach',
  },
  { key: 'other', label: 'Task / other', test: () => true, band: 'bg-mint/60', dot: 'bg-mint' },
];

function toneFor(items) {
  if (!items?.length) return null;
  return TONES.find((tone) => items.some(tone.test));
}

// Outside-month days get the striped placeholder from the design.
const STRIPES = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgb(var(--color-line)) 0 2px, transparent 2px 6px)',
};

export function MiniCalendar({ workspaceId, className }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());
  const gridStart = startOfWeek(month);
  const gridEnd = endOfWeek(endOfMonth(month));
  const { data: items } = useCalendarFeed(workspaceId, {
    from: gridStart,
    to: addDays(gridEnd, 1),
  });
  const byDay = groupItemsByDay(items);

  const days = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) days.push(day);
  const toneOf = (day) => (isSameMonth(day, month) ? toneFor(byDay.get(dayKey(day))) : null);
  const selectedItems = byDay.get(dayKey(selected)) ?? [];

  return (
    <Widget
      icon={CalendarDays}
      title="Calendar"
      className={className}
      actions={
        <Link
          to={`/w/${workspaceId}/calendar`}
          aria-label="Open the full calendar"
          title="Open the full calendar"
          className="bg-subtle text-ink/80 hover:text-ink grid h-9 w-9 place-items-center rounded-full"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Link>
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <RoundIconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </RoundIconButton>
        <span className="text-sm font-semibold tabular-nums">{format(month, 'MMMM yyyy')}</span>
        <RoundIconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </RoundIconButton>
      </div>

      <div className="text-muted grid grid-cols-7 pb-2 text-center text-xs font-medium">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1.5">
        {days.map((day, index) => {
          const inMonth = isSameMonth(day, month);
          const tone = toneOf(day);
          const column = index % 7;
          // Consecutive days of the same kind join into one band within a week row.
          const joinsLeft = tone && column > 0 && toneOf(days[index - 1])?.key === tone.key;
          const joinsRight = tone && column < 6 && toneOf(days[index + 1])?.key === tone.key;
          const isEdge = tone && (!joinsLeft || !joinsRight);
          const inRun = joinsLeft || joinsRight;
          const dayItems = byDay.get(dayKey(day)) ?? [];

          return (
            <div key={dayKey(day)} className="relative flex h-10 items-center justify-center">
              {/* A run of days shares one band, drawn from the centre of its first
                  day to the centre of its last so the end circles sit flush on it.
                  A single day gets just its circle. */}
              {inRun && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-1/2 h-9 -translate-y-1/2',
                    tone.band,
                    joinsLeft ? 'left-0' : 'left-1/2',
                    joinsRight ? 'right-0' : 'right-1/2',
                  )}
                />
              )}
              {inMonth ? (
                <button
                  type="button"
                  onClick={() => setSelected(day)}
                  aria-pressed={isSameDay(day, selected)}
                  aria-label={`${format(day, 'EEEE d MMMM')}${
                    dayItems.length ? `, ${dayItems.length} items` : ''
                  }`}
                  className={cn(
                    'relative grid h-9 w-9 place-items-center rounded-full text-sm tabular-nums transition-colors',
                    isEdge && tone.dot,
                    isEdge && 'text-ink font-semibold shadow-sm',
                    !tone && 'hover:bg-subtle',
                    isToday(day) && 'ring-ink ring-2 ring-offset-0',
                    isSameDay(day, selected) && !isToday(day) && 'ring-accent ring-2',
                  )}
                >
                  {format(day, 'd')}
                </button>
              ) : (
                <span
                  className="h-9 w-9 rounded-full opacity-70"
                  style={STRIPES}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="text-muted mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {TONES.map((tone) => (
          <span key={tone.key} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', tone.dot)} aria-hidden="true" />
            {tone.label}
          </span>
        ))}
      </div>

      <div className="border-line/70 mt-3 border-t pt-3">
        <p className="mb-1.5 text-xs font-semibold">{format(selected, 'EEEE, d MMM')}</p>
        {selectedItems.length === 0 ? (
          <p className="text-muted text-xs">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-1">
            {selectedItems.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-xs">
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', toneFor([item]).dot)}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                <span className="text-muted shrink-0">
                  {item.allDay ? itemLabel(item) : formatTime(item.startsAt)}
                </span>
              </li>
            ))}
            {selectedItems.length > 3 && (
              <li className="text-muted text-xs">+{selectedItems.length - 3} more</li>
            )}
          </ul>
        )}
      </div>
    </Widget>
  );
}
