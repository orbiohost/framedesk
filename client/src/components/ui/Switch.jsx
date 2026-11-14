import { cn } from '../../lib/cn.js';

// A 44x24 track with a 20px knob: 2px of space on every side, on or off.
export function Switch({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-3 rounded-full text-left"
    >
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-out',
          checked ? 'bg-accent' : 'bg-line group-hover:bg-muted/40',
        )}
      >
        <span
          className={cn(
            'bg-surface absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow-sm transition-transform duration-200 ease-out',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </span>
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        {description && <span className="text-muted"> · {description}</span>}
      </span>
    </button>
  );
}
