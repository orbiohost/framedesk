import { BellOff, BellRing } from 'lucide-react';
import { useId } from 'react';
import { chipClassName } from '../../components/ui/ChoiceChips.jsx';
import { fieldLabelClassName } from '../../components/ui/FieldShell.jsx';
import { cn } from '../../lib/cn.js';
import { useNotifications } from './hooks.js';

// Same defaults as the server (server/src/modules/notifications/reminderRules.js).
export const DEFAULT_REMINDERS = {
  event: [15],
  allDayEvent: [0],
  task: [0],
  project: [1440, 0],
};

const TIMED_OPTIONS = [
  { value: 0, label: 'At start' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 1440, label: '1 day' },
];

const DAY_OPTIONS = [
  { value: 0, label: 'On the day' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
  { value: 4320, label: '3 days before' },
  { value: 10080, label: '1 week before' },
];

function hourLabel(hour) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * "Remind me" chips for an event, task or project.
 * value: null (the default for `kind`), [] (no reminders) or minutes before.
 * kind: 'event' | 'allDayEvent' | 'task' | 'project'
 */
export function ReminderField({ kind, value, onChange, className }) {
  const labelId = useId();
  const { data } = useNotifications();
  const timed = kind === 'event';
  const options = timed ? TIMED_OPTIONS : DAY_OPTIONS;
  const isDefault = value === null || value === undefined;
  const active = isDefault ? DEFAULT_REMINDERS[kind] : value;
  const none = !isDefault && value.length === 0;
  const hour = data?.settings.dayReminderHour ?? 9;

  function toggle(minutes) {
    const next = active.includes(minutes)
      ? active.filter((item) => item !== minutes)
      : [...active, minutes].slice(-5);
    onChange(next.sort((a, b) => b - a));
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <p id={labelId} className={fieldLabelClassName}>
        Remind me{timed ? ' before' : ''}
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = active.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(option.value)}
              className={chipClassName(on)}
            >
              {on && <BellRing className="h-3.5 w-3.5" aria-hidden="true" />}
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={none}
          onClick={() => onChange(none ? null : [])}
          className={chipClassName(none)}
        >
          <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
          None
        </button>
      </div>
      <p className="text-muted text-xs">
        {none
          ? 'No reminders for this one.'
          : [
              isDefault ? 'Default reminders.' : null,
              timed ? null : `Sent at ${hourLabel(hour)} your time.`,
              'Change how they reach you in Account › Notifications.',
            ]
              .filter(Boolean)
              .join(' ')}
      </p>
    </div>
  );
}
