import { format, isToday, isTomorrow } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { dayKey } from '../../lib/dates.js';
import { CalendarItem } from './CalendarItem.jsx';

function dayHeading(day) {
  if (isToday(day)) return `Today · ${format(day, 'EEE d MMM')}`;
  if (isTomorrow(day)) return `Tomorrow · ${format(day, 'EEE d MMM')}`;
  return format(day, 'EEEE d MMMM');
}

export function AgendaList({ days, itemsByDay, onOpen }) {
  const busyDays = days.filter((day) => itemsByDay.has(dayKey(day)));

  if (busyDays.length === 0) {
    return (
      <EmptyState icon={CalendarDays} title="A clear stretch">
        No shoots, meetings or deadlines in this period. Add an event, or give projects and tasks a
        due date and they will show up here.
      </EmptyState>
    );
  }

  return (
    <ol className="space-y-5">
      {busyDays.map((day) => (
        <li key={dayKey(day)} className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          <h3 className="text-sm font-medium">{dayHeading(day)}</h3>
          <div className="space-y-1">
            {itemsByDay.get(dayKey(day)).map((item) => (
              <CalendarItem key={item.id} item={item} onOpen={onOpen} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
