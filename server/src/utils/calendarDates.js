// Due dates arrive as the user's local midnight (the browser sends
// `new Date('yyyy-mm-ddT00:00:00').toISOString()`), and the server doesn't know
// their time zone. Moving the moment to noon puts it on the same calendar day in
// UTC for any zone between UTC-12 and UTC+12, so day, weekday and month maths can
// be done in UTC; taking the 12 hours off again lands back on the user's midnight.

const HOUR_MS = 60 * 60 * 1000;
const NOON_SHIFT_MS = 12 * HOUR_MS;

function toNoon(date) {
  return new Date(new Date(date).getTime() + NOON_SHIFT_MS);
}

function fromNoon(noon) {
  return new Date(noon.getTime() - NOON_SHIFT_MS);
}

function isWeekend(noon) {
  const day = noon.getUTCDay();
  return day === 0 || day === 6;
}

export function addDays(date, days) {
  const noon = toNoon(date);
  noon.setUTCDate(noon.getUTCDate() + days);
  return fromNoon(noon);
}

// The next Monday–Friday after `date`.
export function addWeekday(date) {
  const noon = toNoon(date);
  do noon.setUTCDate(noon.getUTCDate() + 1);
  while (isWeekend(noon));
  return fromNoon(noon);
}

// Same day next month, or the month's last day when it is shorter (31 Jan → 28 Feb).
export function addMonth(date) {
  const noon = toNoon(date);
  const day = noon.getUTCDate();
  noon.setUTCDate(1);
  noon.setUTCMonth(noon.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(noon.getUTCFullYear(), noon.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  noon.setUTCDate(Math.min(day, lastDay));
  return fromNoon(noon);
}
