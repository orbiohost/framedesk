const STORAGE_KEY = 'theme';

export function isDarkTheme() {
  return document.documentElement.classList.contains('dark');
}

export function setTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still applies for this visit.
  }
}
