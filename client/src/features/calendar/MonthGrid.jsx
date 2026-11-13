import { format, isSameDay, isSameMonth, isToday } from 'date-fns';
import { cn } from '../../lib/cn.js';
import { dayKey } from '../../lib/dates.js';
import { CalendarItem, itemTone } from './CalendarItem.jsx';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VISIBLE_PER_DAY = 3;

// Click picks the day (its full list shows beside the grid); double-click adds an event.
function DayCell({ day, cursor, items, isSelected, onSelect, onCreate, onOpen }) {
  const hidden = items.length - VISIBLE_PER_DAY;
  const pick = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(day);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => onSelect(day)}
      onDoubleClick={() => onCreate(day)}
      onKeyDown={pick}
      aria-label={`${format(day, 'EEEE d MMMM')}, ${items.length} items`}
      className={cn(
        'border-line/70 hover:bg-subtle/50 relative min-h-16 cursor-pointer border-b border-r p-1.5 text-left transition-colors sm:min-h-28',
        'focus-visible:ring-inset focus-visible:ring-offset-0',
        !isSameMonth(day, cursor) && 'bg-subtle/40 text-muted',
        isSelected && 'bg-accent/5 hover:bg-accent/5 ring-accent/60 ring-2 ring-inset',
      )}
    >
      <span
        className={cn(
          'mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-xs tabular-nums',
          isToday(day) && 'pill-active font-semibold',
        )}
      >
        {format(day, 'd')}
      </span>
      {/* Phones: a dot per item; the list for the picked day is below the grid. */}
      <div className="flex flex-wrap gap-1 sm:hidden" aria-hidden="true">
        {items.slice(0, 4).map((item) => (
          <span key={item.id} className={cn('h-1.5 w-1.5 rounded-full', dotTone(item))} />
        ))}
      </div>
      <div className="hidden space-y-0.5 sm:block">
        {items.slice(0, VISIBLE_PER_DAY).map((item) => (
          <CalendarItem key={item.id} item={item} day={day} onOpen={onOpen} compact />
        ))}
        {hidden > 0 && <p className="text-muted px-1.5 text-xs">+{hidden} more</p>}
      </div>
    </div>
  );
}

// A pastel dot disappears on the surface colour, so neutral items get the muted ink.
function dotTone(item) {
  const tone = itemTone(item);
  return tone === 'bg-subtle' ? 'bg-muted/60' : cn(tone, 'ring-ink/15 ring-1');
}

export function MonthGrid({ days, cursor, itemsByDay, selected, onSelect, onCreate, onOpen }) {
  return (
    <div className="border-line/70 bg-surface shadow-soft overflow-hidden rounded-3xl border-l border-t">
      <div className="border-line/70 grid grid-cols-7 border-b">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="text-muted border-line/70 border-r px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.1em] sm:text-left"
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
            isSelected={isSameDay(day, selected)}
            onSelect={onSelect}
            onCreate={onCreate}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
