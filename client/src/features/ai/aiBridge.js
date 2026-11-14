import { useSyncExternalStore } from 'react';

// Lets any page open the AI assistant on a project or a file ("Ask AI" in a
// "⋯" menu). The request waits here until a chat takes it: the corner panel
// opens and picks it up, or the AI page's chat does if that is on screen.
//
// request: { project?: { id, title }, file?: { id, name, category } }

let pending = null;
const listeners = new Set();

export function openAi(request) {
  pending = { ...request, at: Date.now() };
  for (const listener of listeners) listener();
}

// Returns the waiting request (once) and clears it.
export function takeAiRequest() {
  const request = pending;
  pending = null;
  // A request nobody took within a few seconds is stale (the chat was off).
  return request && Date.now() - request.at < 10_000 ? request : null;
}

export function hasAiRequest() {
  return Boolean(pending);
}

export function onAiRequest(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Whether "Ask AI" should show in menus: set by the corner assistant once it
// knows the assistant is on for this workspace.
let available = false;
const availabilityListeners = new Set();

export function setAiAvailable(value) {
  if (available === value) return;
  available = value;
  for (const listener of availabilityListeners) listener();
}

function subscribeAvailability(listener) {
  availabilityListeners.add(listener);
  return () => availabilityListeners.delete(listener);
}

export function useAiAvailable() {
  return useSyncExternalStore(subscribeAvailability, () => available);
}
