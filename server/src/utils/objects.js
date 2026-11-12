// Drops keys whose value is undefined, so partial updates only touch fields that were sent.
export function withoutUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsInsensitive(text) {
  return new RegExp(escapeRegex(text), 'i');
}
