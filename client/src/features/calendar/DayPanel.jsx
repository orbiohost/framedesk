import { format, isToday, isTomorrow } from 'date-fns';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { CalendarItem } from './CalendarItem.jsx';

function dayName(day) {
  if (isToday(day)) return 'Today';
  if (isTomorrow(day)) return 'Tomorrow';
  return format(day, 'EEEE');
}

// Everything on the day picked in the month grid, with room to read it.
export function DayPanel({ day, items, canEdit, onCreate, onOpen }) {
  return (
    <section
      aria-label={format(day, 'EEEE d MMMM')}
      className="border-line/70 bg-surface shadow-soft rounded-3xl border"
    >
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{dayName(day)}</h3>
          <p className="text-muted text-sm">{format(day, 'd MMMM yyyy')}</p>
        </div>
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={() => onCreate(day)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
          </Button>
        )}
      </header>
      {items.length === 0 ? (
        <p className="text-muted px-5 pb-5 pt-1 text-sm">Nothing planned.</p>
      ) : (
        <div className="space-y-0.5 px-2.5 pb-3">
          {items.map((item) => (
            <CalendarItem key={item.id} item={item} day={day} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}
