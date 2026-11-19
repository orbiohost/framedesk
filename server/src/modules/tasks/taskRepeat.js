import { addDays, addMonth, addWeekday } from '../../utils/calendarDates.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Enough steps to catch a daily task up after more than a year away.
const MAX_STEPS = 500;

function step(date, repeat) {
  switch (repeat) {
    case 'daily':
      return addDays(date, 1);
    case 'weekdays':
      return addWeekday(date);
    case 'weekly':
      return addDays(date, 7);
    case 'monthly':
      return addMonth(date);
    default:
      throw new Error(`Unknown repeat "${repeat}"`);
  }
}

// When the next copy of a repeating task is due. It moves on from the old due
// date, so a weekly Monday task stays on Mondays even when ticked on Wednesday,
// and it skips past turns that were missed, so the new copy isn't already
// overdue. A task without a due date is due one step after it was finished.
export function nextDueDate(dueDate, repeat, now = new Date()) {
  if (!dueDate) return step(now, repeat);

  // Anything later than a day ago counts as "today or later" in every time zone.
  const notBefore = now.getTime() - DAY_MS;
  let next = step(dueDate, repeat);
  for (let i = 0; i < MAX_STEPS && next.getTime() < notBefore; i += 1) {
    next = step(next, repeat);
  }
  return next;
}
