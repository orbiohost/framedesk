// When reminders fire. Offsets are minutes before the item's anchor:
//   timed events      -> the start time (15 = "15 minutes before")
//   deadlines and     -> dayReminderHour (9 AM by default) on that day, in
//   all-day events       the person's time zone (1440 = "the day before, 9 AM")
// An item's own `reminders` list wins; missing or null means these defaults.

const MINUTE_MS = 60 * 1000;

export const DEFAULT_REMINDERS = {
  event: [15],
  allDayEvent: [0],
  task: [0],
  project: [1440, 0],
};

// The latest any reminder can fire before its anchor (a week, see zodHelpers).
export const MAX_LEAD_MINUTES = 7 * 24 * 60;

export function reminderOffsetsFor(kind, item) {
  if (Array.isArray(item.reminders)) return item.reminders;
  if (kind === 'event')
    return item.allDay ? DEFAULT_REMINDERS.allDayEvent : DEFAULT_REMINDERS.event;
  return DEFAULT_REMINDERS[kind] ?? [];
}

const partsFormatters = new Map();

function partsFormatter(timeZone) {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone) {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

// The wall-clock reading of `date` in `timeZone`.
function wallClock(date, timeZone) {
  const values = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(date)
      .map((part) => [part.type, Number(part.value)]),
  );
  return values;
}

function offsetMs(date, timeZone) {
  const v = wallClock(date, timeZone);
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - date.getTime();
}

// The instant when it is year-month-day hour:00 in `timeZone`.
function zonedInstant(year, monthIndex, day, hour, timeZone) {
  const guess = Date.UTC(year, monthIndex, day, hour, 0, 0);
  const first = offsetMs(new Date(guess), timeZone);
  let instant = guess - first;
  // Daylight-saving changes between the guess and the answer.
  const second = offsetMs(new Date(instant), timeZone);
  if (second !== first) instant = guess - second;
  return new Date(instant);
}

/**
 * The moment the item is "at" for this person.
 * dateOnly: a deadline saved as a calendar date (UTC midnight of that day).
 * localDay: an all-day event saved as midnight in the creator's zone.
 */
export function anchorFor(date, { mode, prefs }) {
  if (mode === 'timed') return new Date(date);
  const zone = prefs.timeZone;
  let year;
  let monthIndex;
  let day;
  if (mode === 'dateOnly') {
    year = date.getUTCFullYear();
    monthIndex = date.getUTCMonth();
    day = date.getUTCDate();
  } else {
    // Midnight a few hours either side of UTC: read the day in the person's zone.
    const v = wallClock(new Date(date.getTime() + 12 * 60 * MINUTE_MS), zone);
    year = v.year;
    monthIndex = v.month - 1;
    day = v.day;
  }
  return zonedInstant(year, monthIndex, day, prefs.dayReminderHour ?? 9, zone);
}

export function fireTimes(anchor, offsets) {
  return offsets.map((minutes) => ({
    offset: minutes,
    at: new Date(anchor.getTime() - minutes * MINUTE_MS),
  }));
}
