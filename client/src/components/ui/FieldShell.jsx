import { cn } from '../../lib/cn.js';

export const fieldLabelClassName = 'text-muted block text-[13px] font-medium';

// Label + control + error/hint, shared by every form field.
// `children` is a function receiving the aria props the control must carry.
// `alert` is a problem that isn't the value's fault (e.g. the microphone was blocked).
// `hideLabel` keeps the label for screen readers when the placeholder says enough.
export function FieldShell({ id, label, error, hint, alert, hideLabel, className, children }) {
  const messageId = `${id}-message`;
  const message = error || alert || hint;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : fieldLabelClassName}>
        {label}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': message ? messageId : undefined,
      })}
      {message && (
        <p
          id={messageId}
          role={!error && alert ? 'alert' : undefined}
          className={cn('text-[13px] leading-5', error || alert ? 'text-danger' : 'text-muted')}
        >
          {message}
        </p>
      )}
    </div>
  );
}

// A softly filled box that lifts to the surface colour with an accent edge on focus.
export function controlClassName(error) {
  return cn(
    'bg-subtle/60 text-ink block w-full rounded-[12px] border px-3 text-[15px]',
    'placeholder:text-muted/60 transition-[border-color,background-color,box-shadow] disabled:opacity-60',
    'focus-visible:bg-surface focus-visible:ring-[3px] focus-visible:ring-offset-0',
    error
      ? 'border-danger focus-visible:ring-danger/20'
      : 'border-line/80 enabled:hover:border-muted/40 focus-visible:border-accent/70 focus-visible:ring-accent/20',
  );
}
