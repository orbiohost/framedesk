import { cn } from '../../lib/cn.js';

// The rounded white tile every dashboard widget sits in. On large screens the
// header stays put and the body scrolls inside the tile (`bodyClassName` can
// switch that off when a child manages its own scrolling).
export function Widget({ icon: Icon, title, actions, className, bodyClassName, children }) {
  return (
    <section
      className={cn(
        'bg-surface shadow-soft border-line/50 fit:min-h-0 flex min-w-0 flex-col rounded-[28px] border p-4 sm:p-5',
        className,
      )}
    >
      {title && (
        <header className="mb-4 flex shrink-0 items-center gap-3">
          {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />}
          <h2 className="font-display min-w-0 flex-1 truncate text-xl">{title}</h2>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div
        className={cn(
          'scrollbar-thin fit:-mx-1 fit:overflow-y-auto fit:px-1 min-h-0 flex-1',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function RoundIconButton({ label, onClick, children, className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'bg-subtle text-ink/80 hover:text-ink hover:bg-line/70 grid h-9 w-9 place-items-center rounded-full transition-colors',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
