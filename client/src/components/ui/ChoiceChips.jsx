import { useId } from 'react';
import { cn } from '../../lib/cn.js';
import { fieldLabelClassName } from './FieldShell.jsx';

export function chipClassName(active) {
  return cn(
    'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium',
    'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    active
      ? 'border-accent/50 bg-accent/10 text-accent'
      : 'border-line/80 text-muted enabled:hover:border-muted/40 enabled:hover:text-ink',
  );
}

// One-click choice between a handful of options, in place of a dropdown.
// options: [{ value, label }]. Works with react-hook-form's <Controller>.
export function ChoiceChips({ label, options, value, onChange, className }) {
  const labelId = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <p id={labelId} className={fieldLabelClassName}>
        {label}
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={chipClassName(active)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
