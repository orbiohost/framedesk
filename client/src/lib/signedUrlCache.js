// Signed file links stay valid for about 15 minutes. Reusing one link for most
// of that time saves an API round trip each time a file is opened. It also lets
// the browser serve bytes it already cached under that exact URL (images, the
// parts of a video already watched) instead of downloading them again.

// Stop handing out a link this long before it expires, so it can't run out
// just after the player starts.
const SAFETY_MARGIN_MS = 90 * 1000;
// Never trust a link for longer than this after it arrived. This guards
// against a fast client clock, which would make the server's expiry look later
// than it is.
const MAX_REUSE_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 300;

// key -> { pending } while loading, then { url, reuseUntil }. Map order is
// least recently used first.
const entries = new Map();

function touch(key, entry) {
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
}

function usable(entry) {
  return entry && !entry.pending && entry.reuseUntil > Date.now();
}

// The cached URL, if one is ready right now (so a preview can render it
// immediately, without waiting a tick for a promise).
export function peekSignedUrl(key) {
  const entry = entries.get(key);
  return usable(entry) ? entry.url : null;
}

/**
 * load(): resolves to { url, expiresAt } from the API.
 * fresh: skip the cache, e.g. after the browser reported the link as dead.
 */
export function cachedSignedUrl(key, load, { fresh = false } = {}) {
  const hit = entries.get(key);
  if (!fresh && hit?.pending) return hit.pending;
  if (!fresh && usable(hit)) {
    touch(key, hit);
    return Promise.resolve(hit.url);
  }

  const pending = load().then(
    ({ url, expiresAt }) => {
      const receivedAt = Date.now();
      const serverExpiry = Date.parse(expiresAt) || receivedAt;
      const reuseUntil = Math.min(serverExpiry, receivedAt + MAX_REUSE_MS) - SAFETY_MARGIN_MS;
      if (entries.get(key)?.pending === pending) touch(key, { url, reuseUntil });
      return url;
    },
    (error) => {
      if (entries.get(key)?.pending === pending) entries.delete(key);
      throw error;
    },
  );
  touch(key, { pending });
  return pending;
}

// Drops every link whose key starts with `prefix` (e.g. after a rename, since
// the download name is baked into the link).
export function forgetSignedUrls(prefix) {
  for (const key of [...entries.keys()]) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

export function clearSignedUrls() {
  entries.clear();
}
