import { Star } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

// value: 1-5 or null. Without onChange it just shows the rating.
export function StarRating({ value, onChange, size = 'md' }) {
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-6 w-6';
  if (!onChange) {
    return (
      <span className="text-warning inline-flex" role="img" aria-label={`${value} out of 5`}>
        {LABELS.map((label, index) => (
          <Star
            key={label}
            className={cn(icon, index < value ? 'fill-current' : 'opacity-30')}
            aria-hidden="true"
          />
        ))}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label="Rating" className="flex">
        {LABELS.map((label, index) => {
          const rating = index + 1;
          const active = value !== null && rating <= value;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={value === rating}
              aria-label={label}
              title={label}
              onClick={() => onChange(value === rating ? null : rating)}
              className="rounded-md p-1 transition-transform hover:scale-110 active:scale-95"
            >
              <Star
                className={cn(
                  icon,
                  'transition-colors',
                  active ? 'fill-warning text-warning' : 'text-muted',
                )}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <span className="text-muted text-sm">{value ? LABELS[value - 1] : 'Optional'}</span>
    </div>
  );
}
