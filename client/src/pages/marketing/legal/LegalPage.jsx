import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

// Who runs FrameDesk, as the policies name it. Change here and both pages follow.
export const LEGAL = {
  product: 'FrameDesk',
  operator: 'Orbio Designs',
  site: 'https://desk.orbio.in',
  email: 'orbiodesigns@gmail.com',
  country: 'India',
  effective: '16 November 2026',
};

export function Mail() {
  return (
    <a href={`mailto:${LEGAL.email}`} className="text-accent font-medium hover:underline">
      {LEGAL.email}
    </a>
  );
}

export function Ext({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
      {children}
    </a>
  );
}

/** sections: [{ id, title, body }] */
export function LegalPage({ title, intro, sections, other }) {
  const { hash } = useLocation();
  // The page loads lazily, so jump to #section once it is on screen.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [hash]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${LEGAL.product}`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6">
      <div className="max-w-3xl">
        <p className="text-muted text-sm">Effective {LEGAL.effective}</p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <div className="text-ink/85 mt-4 space-y-3 text-[15px] leading-relaxed">{intro}</div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24 space-y-1 text-sm">
            <p className="text-muted mb-2 text-xs font-semibold uppercase tracking-wider">
              On this page
            </p>
            {sections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-muted hover:text-ink block py-0.5"
              >
                {index + 1}. {section.title}
              </a>
            ))}
            <Link to={other.to} className="text-accent mt-4 block font-medium hover:underline">
              {other.label} →
            </Link>
          </div>
        </nav>

        <div className="max-w-3xl space-y-10">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="font-display text-xl font-semibold">
                {index + 1}. {section.title}
              </h2>
              <div className="text-ink/85 mt-3 space-y-3 text-[15px] leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
                {section.body}
              </div>
            </section>
          ))}
          <p className="text-muted border-line border-t pt-6 text-sm">
            Questions about this page? Write to <Mail />. See also our{' '}
            <Link to={other.to} className="text-accent hover:underline">
              {other.label}
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
