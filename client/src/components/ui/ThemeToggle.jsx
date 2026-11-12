import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn.js';
import { isDarkTheme, setTheme } from '../../lib/theme.js';

const OPTIONS = [
  { value: 'light', label: 'Use light theme', icon: Sun },
  { value: 'dark', label: 'Use dark theme', icon: Moon },
];

// A two-button sun/moon pill; `compact` shows just the icon for the other theme.
export function ThemeToggle({ compact = false }) {
  const [dark, setDark] = useState(isDarkTheme);

  function choose(theme) {
    setTheme(theme);
    setDark(theme === 'dark');
  }

  if (compact) {
    const Icon = dark ? Sun : Moon;
    return (
      <button
        type="button"
        onClick={() => choose(dark ? 'light' : 'dark')}
        aria-label={dark ? 'Use light theme' : 'Use dark theme'}
        className="text-muted hover:bg-subtle hover:text-ink grid h-9 w-9 place-items-center rounded-full"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div role="group" aria-label="Theme" className="bg-subtle flex rounded-full p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = (value === 'dark') === dark;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => choose(value)}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-full transition-colors',
              active ? 'pill-active' : 'text-muted hover:text-ink',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
