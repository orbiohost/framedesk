import { addDays, isBefore, startOfDay } from 'date-fns';
import { dayKey } from '../../lib/dates.js';

export const EVENT_TYPE_OPTIONS = [
  { value: 'shoot', label: 'Shoot' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'delivery', label: 'Delivery deadline' },
  { value: 'review_call', label: 'Review call' },
  { value: 'custom', label: 'Other' },
];

export function eventTypeLabel(value) {
  return EVENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? 'Event';
}

export function itemLabel(item) {
  if (item.kind === 'project_due') return 'Project due';
  if (item.kind === 'task_due') return 'Task due';
  return eventTypeLabel(item.type);
}

// Deadlines get the accent; everything else stays neutral so the accent means something.
export function isDeadline(item) {
  return item.kind === 'project_due' || item.type === 'delivery';
}

// Multi-day events appear on every day they cover (within the visible range).
export function groupItemsByDay(items = []) {
  const groups = new Map();
  for (const item of items) {
    let day = startOfDay(new Date(item.startsAt));
    const lastDay = startOfDay(new Date(item.endsAt));
    while (!isBefore(lastDay, day)) {
      const key = dayKey(day);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
      day = addDays(day, 1);
    }
  }
  return groups;
}
