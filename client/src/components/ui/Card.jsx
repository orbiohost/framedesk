import { cn } from '../../lib/cn.js';

export function Card({ className, children }) {
  return (
    <section className={cn('bg-surface shadow-soft border-line/60 rounded-3xl border', className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description }) {
  return (
    <header className="border-line border-b px-5 py-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {description && <p className="text-muted mt-0.5 text-sm">{description}</p>}
    </header>
  );
}
