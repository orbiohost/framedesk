import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

const WEEK = { weekStartsOn: 1 };
const AGENDA_DAYS = 30;

// The days shown for a view, and the half-open [from, to) range to fetch.
export function visibleRange(view, cursor) {
  if (view === 'month') {
    const from = startOfWeek(startOfMonth(cursor), WEEK);
    const last = endOfWeek(endOfMonth(cursor), WEEK);
    return withDays(from, last);
  }
  if (view === 'week') {
    const from = startOfWeek(cursor, WEEK);
    return withDays(from, addDays(from, 6));
  }
  const from = startOfDay(cursor);
  return withDays(from, addDays(from, AGENDA_DAYS - 1));
}

function withDays(from, last) {
  return {
    from,
    to: addDays(startOfDay(last), 1),
    days: eachDayOfInterval({ start: from, end: last }),
  };
}

export function stepCursor(view, cursor, direction) {
  if (view === 'month') return addMonths(cursor, direction);
  if (view === 'week') return addWeeks(cursor, direction);
  return addDays(cursor, direction * AGENDA_DAYS);
}

export function rangeTitle(view, { days }) {
  if (view === 'month') return format(days[10], 'MMMM yyyy');
  const first = days[0];
  const last = days.at(-1);
  return `${format(first, 'd MMM')} – ${format(last, 'd MMM yyyy')}`;
}
