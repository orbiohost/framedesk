const STORAGE_KEY = 'theme';

export function isDarkTheme() {
  return document.documentElement.classList.contains('dark');
}

// Browser/Android status bar colour; same values as --color-bg in styles/index.css.
const THEME_COLORS = { light: '#F5F4F8', dark: '#16151C' };

export function setTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', THEME_COLORS[theme === 'dark' ? 'dark' : 'light']);
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still applies for this visit.
  }
}
