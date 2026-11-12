import { format } from 'date-fns';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// "57 days left", or "5h 12m left" on the final day. Null once it has ended.
export function timeLeftLabel(endsAt, now) {
  const msLeft = new Date(endsAt).getTime() - now;
  if (msLeft <= 0) return null;
  if (msLeft >= DAY_MS) {
    const days = Math.ceil(msLeft / DAY_MS);
    return `${days} ${days === 1 ? 'day' : 'days'} left`;
  }
  const hours = Math.floor(msLeft / HOUR_MS);
  const minutes = Math.floor((msLeft % HOUR_MS) / 60000);
  return `${hours}h ${minutes}m left`;
}

export function offerDeadline(endsAt) {
  return format(new Date(endsAt), 'd MMM yyyy');
}
