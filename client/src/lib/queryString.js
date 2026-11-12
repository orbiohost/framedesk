// { status: 'active', q: '' } -> "?status=active" (empty values are skipped)
export function toQueryString(params = {}) {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries).toString()}`;
}
