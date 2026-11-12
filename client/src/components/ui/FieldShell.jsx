import { cn } from '../../lib/cn.js';

// Label + control + error/hint, shared by every form field.
// `children` is a function receiving the aria props the control must carry.
// `alert` is a problem that isn't the value's fault (e.g. the microphone was blocked).
export function FieldShell({ id, label, error, hint, alert, className, children }) {
  const messageId = `${id}-message`;
  const message = error || alert || hint;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
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
          className={cn('text-sm', error || alert ? 'text-danger' : 'text-muted')}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export function controlClassName(error) {
  return cn(
    'bg-surface text-ink block w-full rounded-xl border px-3.5 text-[15px]',
    'placeholder:text-muted/70 transition-colors disabled:opacity-60',
    error ? 'border-danger' : 'border-line hover:border-muted/50',
  );
}
