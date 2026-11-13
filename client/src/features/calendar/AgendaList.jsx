import { format, isToday, isTomorrow } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { cn } from '../../lib/cn.js';
import { dayKey } from '../../lib/dates.js';
import { CalendarItem } from './CalendarItem.jsx';

function dayNote(day) {
  if (isToday(day)) return 'Today';
  if (isTomorrow(day)) return 'Tomorrow';
  return format(day, 'MMM');
}

// Only the days with something on them, each with its date on the left.
export function AgendaList({ days, itemsByDay, onOpen, className }) {
  const busyDays = days.filter((day) => itemsByDay.has(dayKey(day)));

  if (busyDays.length === 0) {
    return (
      <EmptyState icon={CalendarDays} title="A clear stretch" className={className}>
        No shoots, meetings or deadlines in this period. Add an event, or give projects and tasks a
        due date and they will show up here.
      </EmptyState>
    );
  }

  return (
    <ol
      className={cn(
        'border-line/70 bg-surface shadow-soft divide-line/70 divide-y overflow-hidden rounded-3xl border',
        className,
      )}
    >
      {busyDays.map((day) => (
        <li key={dayKey(day)} className="flex gap-3 px-3 py-3 sm:gap-4 sm:px-5">
          <h3
            aria-label={format(day, 'EEEE d MMMM')}
            className="w-14 shrink-0 pt-1.5 text-center leading-none"
          >
            <span className="text-muted block text-[11px] font-semibold uppercase tracking-[0.1em]">
              {format(day, 'EEE')}
            </span>
            <span
              className={cn(
                'font-display mx-auto mt-1 grid h-9 w-9 place-items-center rounded-full text-lg tabular-nums',
                isToday(day) && 'pill-active',
              )}
            >
              {format(day, 'd')}
            </span>
            <span className="text-muted mt-1 block text-[11px]">{dayNote(day)}</span>
          </h3>
          <div className="min-w-0 flex-1 space-y-0.5">
            {itemsByDay.get(dayKey(day)).map((item) => (
              <CalendarItem key={item.id} item={item} day={day} onOpen={onOpen} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
