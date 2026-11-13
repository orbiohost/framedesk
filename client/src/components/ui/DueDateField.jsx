import { addDays, nextMonday } from 'date-fns';
import { useId } from 'react';
import { cn } from '../../lib/cn.js';
import { dayKey } from '../../lib/dates.js';
import { chipClassName } from './ChoiceChips.jsx';
import { controlClassName, fieldLabelClassName } from './FieldShell.jsx';

function shortcuts() {
  const today = new Date();
  return [
    { label: 'Today', value: dayKey(today) },
    { label: 'Tomorrow', value: dayKey(addDays(today, 1)) },
    { label: 'Next week', value: dayKey(nextMonday(today)) },
  ];
}

// A date with one-click shortcuts; the picker is still there for any other day.
// value: 'yyyy-MM-dd' or ''. Clicking the active shortcut clears the date.
export function DueDateField({ label = 'Due', value, onChange, error, className }) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className={fieldLabelClassName}>
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {shortcuts().map((shortcut) => {
          const active = shortcut.value === value;
          return (
            <button
              key={shortcut.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? '' : shortcut.value)}
              className={chipClassName(active)}
            >
              {shortcut.label}
            </button>
          );
        })}
        <input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          className={cn(
            controlClassName(error),
            'h-8 w-auto rounded-full text-[13px]',
            !value && 'text-muted',
          )}
        />
      </div>
      {error && <p className="text-danger text-[13px] leading-5">{error}</p>}
    </div>
  );
}
