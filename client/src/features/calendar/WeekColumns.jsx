import { format, isToday } from 'date-fns';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { dayKey } from '../../lib/dates.js';
import { CalendarItem } from './CalendarItem.jsx';

export function WeekColumns({ days, itemsByDay, canEdit, onDayClick, onOpen }) {
  return (
    <div className="grid gap-2 sm:grid-cols-7">
      {days.map((day) => {
        const items = itemsByDay.get(dayKey(day)) ?? [];
        return (
          <section
            key={dayKey(day)}
            className="border-line bg-surface flex min-h-40 flex-col rounded-lg border"
          >
            <header className="border-line flex items-center justify-between border-b px-2.5 py-2">
              <span className={cn('text-sm', isToday(day) && 'text-accent font-semibold')}>
                {format(day, 'EEE d')}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onDayClick(day)}
                  aria-label={`Add event on ${format(day, 'EEEE d MMMM')}`}
                  className="text-muted hover:text-ink rounded p-0.5"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </header>
            <div className="flex-1 space-y-1 p-1.5">
              {items.map((item) => (
                <CalendarItem key={item.id} item={item} onOpen={onOpen} compact />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
