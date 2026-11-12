// Colors come from CSS variables (src/styles/index.css) so dark mode is a
// single class switch and opacity modifiers like bg-ink/10 still work.
function token(name) {
  return `rgb(var(--color-${name}) / <alpha-value>)`;
}

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Wide *and* tall enough for the dashboard to fit the window with no page scroll.
      screens: {
        fit: { raw: '(min-width: 1280px) and (min-height: 920px)' },
        // Laptop and 720p screens: tighter spacing so more fits above the fold.
        short: { raw: '(min-width: 1024px) and (max-height: 820px)' },
      },
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        subtle: token('subtle'),
        line: token('line'),
        ink: token('ink'),
        muted: token('muted'),
        accent: { DEFAULT: token('accent'), ink: token('accent-ink') },
        danger: token('danger'),
        success: token('success'),
        warning: token('warning'),
        lavender: token('lavender'),
        pink: token('pink'),
        peach: token('peach'),
        mint: token('mint'),
        chart: token('chart'),
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // Everything is softer than Tailwind's defaults, so existing screens pick up
      // the rounded look without touching each class.
      borderRadius: {
        sm: '0.5rem',
        DEFAULT: '0.625rem',
        md: '0.875rem',
        lg: '1.25rem',
        xl: '1.5rem',
        '2xl': '1.75rem',
        '3xl': '2rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(22 21 27 / 0.04), 0 8px 24px -12px rgb(76 50 140 / 0.18)',
        lift: '0 2px 4px rgb(22 21 27 / 0.05), 0 18px 40px -18px rgb(76 50 140 / 0.35)',
      },
      transitionDuration: { DEFAULT: '180ms' },
    },
  },
};
