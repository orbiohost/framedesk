import { differenceInCalendarDays, format, isToday, isTomorrow, isYesterday } from 'date-fns';

// Date-only fields (due dates) travel as midnight in the user's own time zone,
// so "20 Nov" stays 20 Nov wherever it is displayed.

export function toDateInputValue(iso) {
  return iso ? format(new Date(iso), 'yyyy-MM-dd') : '';
}

export function fromDateInputValue(value) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

export function toDateTimeInputValue(iso) {
  return iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '';
}

export function fromDateTimeInputValue(value) {
  return value ? new Date(value).toISOString() : null;
}

export function dayKey(date) {
  return format(date, 'yyyy-MM-dd');
}

export function formatDate(iso) {
  return format(new Date(iso), 'd MMM yyyy');
}

export function formatTime(iso) {
  return format(new Date(iso), 'h:mm a');
}

export function isOverdue(iso) {
  return Boolean(iso) && differenceInCalendarDays(new Date(iso), new Date()) < 0;
}

export function formatDueLabel(iso) {
  const date = new Date(iso);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'd MMM');
}
