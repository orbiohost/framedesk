// localStorage wrapper for small per-browser conveniences (never for data that must persist).

export function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked; the preference just won't be remembered.
  }
}
