import { format, isSameMonth, isToday } from 'date-fns';
import { cn } from '../../lib/cn.js';
import { dayKey } from '../../lib/dates.js';
import { CalendarItem } from './CalendarItem.jsx';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VISIBLE_PER_DAY = 3;

function DayCell({ day, cursor, items, onDayClick, onOpen }) {
  const hidden = items.length - VISIBLE_PER_DAY;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onDayClick(day)}
      onKeyDown={(event) => event.key === 'Enter' && onDayClick(day)}
      aria-label={`${format(day, 'EEEE d MMMM')}, ${items.length} items`}
      className={cn(
        'border-line hover:bg-subtle/50 min-h-24 cursor-pointer border-b border-r p-1.5 text-left sm:min-h-28',
        !isSameMonth(day, cursor) && 'bg-subtle/40 text-muted',
      )}
    >
      <span
        className={cn(
          'mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-xs tabular-nums',
          isToday(day) && 'pill-active font-medium',
        )}
      >
        {format(day, 'd')}
      </span>
      <div className="space-y-0.5">
        {items.slice(0, VISIBLE_PER_DAY).map((item) => (
          <CalendarItem key={item.id} item={item} onOpen={onOpen} compact />
        ))}
        {hidden > 0 && <p className="text-muted px-1.5 text-xs">+{hidden} more</p>}
      </div>
    </div>
  );
}

export function MonthGrid({ days, cursor, itemsByDay, onDayClick, onOpen }) {
  return (
    <div className="border-line bg-surface shadow-soft overflow-hidden rounded-3xl border-l border-t">
      <div className="border-line grid grid-cols-7 border-b">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="text-muted border-line border-r px-2 py-1.5 text-xs uppercase tracking-[0.1em]"
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <DayCell
            key={dayKey(day)}
            day={day}
            cursor={cursor}
            items={itemsByDay.get(dayKey(day)) ?? []}
            onDayClick={onDayClick}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
