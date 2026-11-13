import { format, isToday } from 'date-fns';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { dayKey } from '../../lib/dates.js';
import { AgendaList } from './AgendaList.jsx';
import { CalendarItem } from './CalendarItem.jsx';

// Seven columns on a wide screen. On a phone they would be slivers, so the
// week reads as a list of its busy days instead.
export function WeekColumns({ days, itemsByDay, canEdit, onDayClick, onOpen }) {
  return (
    <>
      <AgendaList days={days} itemsByDay={itemsByDay} onOpen={onOpen} className="sm:hidden" />
      <div className="border-line/70 bg-surface shadow-soft divide-line/70 hidden grid-cols-7 divide-x overflow-hidden rounded-3xl border sm:grid">
        {days.map((day) => {
          const items = itemsByDay.get(dayKey(day)) ?? [];
          return (
            <section
              key={dayKey(day)}
              aria-label={format(day, 'EEEE d MMMM')}
              onDoubleClick={() => onDayClick(day)}
              className={cn('group flex min-h-72 min-w-0 flex-col', isToday(day) && 'bg-accent/5')}
            >
              <header className="border-line/70 flex items-center gap-2 border-b px-2.5 py-2">
                <span className="text-muted text-[11px] font-semibold uppercase tracking-[0.1em]">
                  {format(day, 'EEE')}
                </span>
                <span
                  className={cn(
                    'grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm tabular-nums',
                    isToday(day) && 'pill-active font-semibold',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onDayClick(day)}
                    aria-label={`Add event on ${format(day, 'EEEE d MMMM')}`}
                    className="text-muted hover:bg-subtle hover:text-ink ml-auto grid h-6 w-6 place-items-center rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </header>
              <div className="flex-1 space-y-1 p-1.5">
                {items.map((item) => (
                  <CalendarItem key={item.id} item={item} day={day} onOpen={onOpen} compact />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
