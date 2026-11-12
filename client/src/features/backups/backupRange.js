import { endOfDay, format, startOfDay, startOfYear, subDays } from 'date-fns';

// Date inputs are whole days in the user's time zone: from the start of the first
// day to the very end of the last one.
export function rangeFromInputs(fromValue, toValue) {
  if (!fromValue || !toValue) return null;
  return {
    from: startOfDay(new Date(`${fromValue}T00:00:00`)).toISOString(),
    to: endOfDay(new Date(`${toValue}T00:00:00`)).toISOString(),
  };
}

const toInput = (date) => format(date, 'yyyy-MM-dd');

export const RANGE_PRESETS = [
  { label: 'Last 7 days', dates: () => [subDays(new Date(), 6), new Date()] },
  { label: 'Last 30 days', dates: () => [subDays(new Date(), 29), new Date()] },
  { label: 'This year', dates: () => [startOfYear(new Date()), new Date()] },
].map((preset) => ({
  label: preset.label,
  inputs: () => preset.dates().map(toInput),
}));

export function describeRange(range) {
  if (!range) return 'everything';
  return `${format(new Date(range.from), 'd MMM yyyy')} – ${format(new Date(range.to), 'd MMM yyyy')}`;
}
