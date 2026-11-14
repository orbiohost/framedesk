export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-8 sm:gap-4">
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="text-muted mb-2 text-xs font-medium uppercase tracking-[0.14em]">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[26px] leading-tight sm:text-3xl md:text-[34px]">
          {title}
        </h1>
        {description && (
          <p className="text-muted mt-1.5 text-sm sm:mt-2 sm:text-base">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
      )}
    </header>
  );
}
