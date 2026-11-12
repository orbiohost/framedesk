const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * MINUTE_MS);
}

export function hoursFromNow(hours) {
  return new Date(Date.now() + hours * HOUR_MS);
}

export function daysFromNow(days) {
  return new Date(Date.now() + days * DAY_MS);
}
