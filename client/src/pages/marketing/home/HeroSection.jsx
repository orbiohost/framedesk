import { Link } from 'react-router-dom';
import { ProductPreview } from './ProductPreview.jsx';

export function HeroSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 md:pt-24">
      <p className="text-muted mb-5 text-xs uppercase tracking-[0.16em]">
        For video editors, designers and small studios
      </p>
      <h1 className="font-display max-w-4xl text-5xl leading-[1.02] tracking-tight sm:text-6xl md:text-7xl">
        Footage, files and client feedback, on one desk.
      </h1>
      <p className="text-muted mt-6 max-w-xl text-lg leading-relaxed">
        Each project keeps its raw footage, working files, exports, versions and client notes in one
        place. No more feedback in WhatsApp threads, and no more WeTransfer links that expire.
      </p>
      <div className="mt-9 flex flex-wrap items-center gap-3">
        <Link
          to="/signup"
          className="bg-accent text-accent-ink hover:bg-accent/90 rounded-md px-5 py-3 text-sm font-medium"
        >
          Start your 7-day trial
        </Link>
        <a
          href="#pricing"
          className="border-line bg-surface hover:bg-subtle rounded-md border px-5 py-3 text-sm font-medium"
        >
          See pricing
        </a>
        <span className="text-muted text-sm">No card needed. 5 GB during the trial.</span>
      </div>
      <div className="mt-16">
        <ProductPreview />
      </div>
    </section>
  );
}
