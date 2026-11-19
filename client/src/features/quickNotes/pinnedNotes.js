import { useCallback, useSyncExternalStore } from 'react';
import { readLocal, writeLocal } from '../../lib/storage.js';

// Notes pinned to the screen: small sticky notes that float over every page.
// Which notes, where they sit, their paper colour and whether they're folded
// are a per-device convenience, so they live in localStorage (per workspace).
//
// item: { id, x, y, color, min }. id is a note id, or "draft-…" for a sticky
// that hasn't been saved yet (it becomes a note once something is written).

export const MAX_PINNED = 6;
export const STICKY_WIDTH = 272;
export const STICKY_COLORS = ['peach', 'mint', 'lavender', 'pink', 'paper'];

const EMPTY = Object.freeze([]);
const listeners = new Set();
const cache = new Map();

const storageKey = (workspaceId) => `notes:pinned:${workspaceId}`;

function read(workspaceId) {
  if (cache.has(workspaceId)) return cache.get(workspaceId);
  let items = EMPTY;
  try {
    const parsed = JSON.parse(readLocal(storageKey(workspaceId)) ?? '[]');
    if (Array.isArray(parsed)) {
      items = parsed
        .filter((item) => item && typeof item.id === 'string')
        .slice(0, MAX_PINNED)
        // Drafts don't survive a reload: there's nothing in them yet.
        .filter((item) => !item.id.startsWith('draft-'));
    }
  } catch {
    // A broken value starts over empty.
  }
  cache.set(workspaceId, items);
  return items;
}

function write(workspaceId, items) {
  cache.set(workspaceId, items);
  writeLocal(
    storageKey(workspaceId),
    JSON.stringify(items.filter((item) => !item.id.startsWith('draft-'))),
  );
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  // Another tab pinned or moved a note.
  function onStorage(event) {
    if (!event.key?.startsWith('notes:pinned:')) return;
    cache.delete(event.key.slice('notes:pinned:'.length));
    listener();
  }
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

// Where a new sticky lands: the top-right corner, each one a step down-left.
function nextSpot(items) {
  const step = items.length % 5;
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
  return {
    x: Math.max(8, width - STICKY_WIDTH - 24 - step * 28),
    y: 88 + step * 32,
  };
}

export function usePinnedNotes(workspaceId) {
  const items = useSyncExternalStore(
    subscribe,
    () => read(workspaceId),
    () => EMPTY,
  );

  const update = useCallback(
    (change) => {
      const current = read(workspaceId);
      const next = change(current);
      if (next !== current) write(workspaceId, next);
    },
    [workspaceId],
  );

  const isPinned = useCallback((id) => items.some((item) => item.id === id), [items]);

  // Returns false when the screen already has the most stickies allowed.
  const pin = useCallback(
    (id) => {
      const current = read(workspaceId);
      if (current.some((item) => item.id === id)) {
        // Already up: bring it back open.
        update((list) => list.map((item) => (item.id === id ? { ...item, min: false } : item)));
        return true;
      }
      if (current.length >= MAX_PINNED) return false;
      update((list) => [...list, { id, key: id, ...nextSpot(list), color: 'peach', min: false }]);
      return true;
    },
    [workspaceId, update],
  );

  const unpin = useCallback(
    (id) => update((list) => list.filter((item) => item.id !== id)),
    [update],
  );

  const patch = useCallback(
    (id, changes) =>
      update((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item))),
    [update],
  );

  // A new empty sticky on screen.
  const pinDraft = useCallback(() => {
    const id = `draft-${Date.now().toString(36)}`;
    return pin(id) ? id : null;
  }, [pin]);

  // The draft got saved: it's that note from now on.
  const replaceId = useCallback(
    (from, to) =>
      update((list) => list.map((item) => (item.id === from ? { ...item, id: to } : item))),
    [update],
  );

  // Moves a sticky to the end of the list so it draws on top of the others.
  const raise = useCallback(
    (id) =>
      update((list) => {
        const index = list.findIndex((item) => item.id === id);
        if (index === -1 || index === list.length - 1) return list;
        return [...list.slice(0, index), ...list.slice(index + 1), list[index]];
      }),
    [update],
  );

  return {
    items,
    isPinned,
    pin,
    unpin,
    patch,
    pinDraft,
    replaceId,
    raise,
    full: items.length >= MAX_PINNED,
  };
}
