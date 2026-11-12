export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="text-muted mb-2 text-xs font-medium uppercase tracking-[0.14em]">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl leading-tight md:text-[34px]">{title}</h1>
        {description && <p className="text-muted mt-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
