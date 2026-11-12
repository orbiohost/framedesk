import { cn } from '../../lib/cn.js';

export function EmptyState({ icon: Icon, title, children, action, className }) {
  return (
    <div
      className={cn(
        'border-line bg-surface/60 flex flex-col items-center rounded-3xl border border-dashed px-6 py-14 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="bg-lavender text-accent dark:text-ink mb-4 grid h-12 w-12 place-items-center rounded-2xl">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <h2 className="font-display text-2xl">{title}</h2>
      {children && <p className="text-muted mt-2 max-w-md text-sm">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
