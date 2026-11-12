import { dehydrate, hydrate } from '@tanstack/react-query';
import { readCookie } from './cookies.js';

// Keeps a copy of the React Query cache in localStorage, so after a reload or
// a later visit, pages show what they showed last time immediately and update
// in the background. Hydrated data keeps its original fetch time, so it counts
// as stale and every screen refetches as soon as it mounts.
//
// The copy belongs to one signed-in user. It is only read back while the
// session cookie hint exists, it is dropped if a different user turns out to be
// signed in, and it is wiped on sign-out (clearPersistedQueries). Who is signed
// in is never restored from disk: the route guards always ask the server.

const STORAGE_KEY = 'framedesk:query-cache';
// Bump when the shape of API data changes, so old copies are thrown away.
const CACHE_VERSION = 2;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// localStorage holds roughly 5 MB per origin; leave room for everything else.
const MAX_CHARS = 2_000_000;
const SAVE_DELAY_MS = 1000;
const SESSION_HINT_COOKIE = 'session_hint';
const USER_QUERY = 'currentUser';
// Not kept on disk: platform admin data (sensitive), and workspace features
// that poll anyway or are only ever looked at fresh.
// Shared links can be turned off at any time, so what they showed isn't kept.
const SKIPPED_ROOTS = new Set(['admin', 'share', USER_QUERY]);
// Transcripts can be long; they are cheap to fetch again.
const SKIPPED_FEATURES = new Set(['chat', 'backups', 'transcripts']);

function isPersistable(query) {
  if (query.state.status !== 'success' || query.state.data === undefined) return false;
  const [root, , feature] = query.queryKey;
  if (SKIPPED_ROOTS.has(root)) return false;
  return !(root === 'ws' && SKIPPED_FEATURES.has(feature));
}

function signedInUserId(queryClient) {
  return queryClient.getQueryData([USER_QUERY])?.id ?? null;
}

export function clearPersistedQueries() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was saved either.
  }
}

// Returns the id of the user the restored data belongs to, or null.
function restore(queryClient) {
  if (!readCookie(SESSION_HINT_COOKIE)) {
    clearPersistedQueries();
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const expired = Date.now() - saved.savedAt > MAX_AGE_MS;
    if (saved.version !== CACHE_VERSION || expired || !saved.userId) {
      clearPersistedQueries();
      return null;
    }
    hydrate(queryClient, { queries: saved.queries, mutations: [] });
    return saved.userId;
  } catch {
    clearPersistedQueries();
    return null;
  }
}

// Newest data first, until the size budget runs out.
function serialize(queryClient, userId) {
  const { queries } = dehydrate(queryClient, { shouldDehydrateQuery: isPersistable });
  queries.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  const parts = [];
  let size = 0;
  for (const query of queries) {
    const json = JSON.stringify(query);
    if (size + json.length > MAX_CHARS) continue;
    parts.push(json);
    size += json.length + 1;
  }
  const header = `"version":${CACHE_VERSION},"savedAt":${Date.now()},"userId":${JSON.stringify(userId)}`;
  return `{${header},"queries":[${parts.join(',')}]}`;
}

function save(queryClient) {
  // Signed out (or the session lapsed): keep nothing on disk.
  const userId = signedInUserId(queryClient);
  if (!userId) {
    clearPersistedQueries();
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, serialize(queryClient, userId));
  } catch {
    // Quota exceeded or storage blocked: the app works the same, just colder.
    clearPersistedQueries();
  }
}

const whenIdle =
  typeof requestIdleCallback === 'function'
    ? (callback) => requestIdleCallback(callback, { timeout: 2000 })
    : (callback) => setTimeout(callback, 0);

export function persistQueryCache(queryClient) {
  if (typeof window === 'undefined') return;
  let restoredFor = restore(queryClient);

  let timer = null;
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    save(queryClient);
  };
  // Many queries settle at once on navigation; write once they have.
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => whenIdle(flush), SAVE_DELAY_MS);
  };

  queryClient.getQueryCache().subscribe((event) => {
    // The guards render nothing until the server says who is signed in. If
    // that is someone else, the restored data is not theirs to see.
    if (restoredFor && event.query.queryKey[0] === USER_QUERY && event.type === 'updated') {
      if (event.action.type !== 'success') return;
      const userId = event.query.state.data?.id ?? null;
      if (userId !== restoredFor) {
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== USER_QUERY });
      }
      restoredFor = null;
    }
    if (event.type === 'added' || event.type === 'removed' || event.type === 'updated') {
      if (event.type === 'updated' && event.action.type !== 'success') return;
      schedule();
    }
  });
  // Last chance before the tab closes or goes to the background.
  window.addEventListener('pagehide', () => timer && flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer) flush();
  });
}
