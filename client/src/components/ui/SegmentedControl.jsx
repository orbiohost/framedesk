import { cn } from '../../lib/cn.js';

// options: [{ value, label, icon? }]
// activeClassName: how the chosen option looks (the dark pill by default).
export function SegmentedControl({
  label,
  options,
  value,
  onChange,
  className,
  activeClassName = 'pill-active',
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'border-line/70 bg-surface inline-flex rounded-full border p-1 shadow-sm',
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm transition-colors',
              isActive ? activeClassName : 'text-muted hover:text-ink',
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
