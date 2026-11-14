import { cn } from '../../lib/cn.js';

// A card of settings rows: each row has its label and explanation on the
// left and the control on the right, stacking on small screens.
export function SettingsSection({ title, description, action, children, className }) {
  return (
    <section className={cn('bg-surface border-line/60 shadow-soft rounded-3xl border', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-1 pt-5 sm:px-6">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="text-muted mt-0.5 text-sm">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="divide-line/70 divide-y px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function SettingsRow({ label, description, children, align = 'start' }) {
  return (
    <div
      className={cn(
        'grid gap-3 py-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8',
        align === 'center' && 'md:items-center',
      )}
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-muted mt-0.5 text-[13px] leading-5">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
