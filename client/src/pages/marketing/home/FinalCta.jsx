import { Link } from 'react-router-dom';

export function FinalCta() {
  return (
    <section className="pill-active mx-3 mb-6 rounded-[36px] sm:mx-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-20 sm:px-6 md:flex-row md:items-end md:justify-between">
        <h2 className="font-display max-w-2xl text-4xl leading-tight tracking-tight md:text-6xl">
          Put your next project on the desk.
        </h2>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <Link
            to="/signup"
            className="bg-accent text-accent-ink hover:bg-accent/90 rounded-md px-5 py-3 text-sm font-medium"
          >
            Start your 7-day trial
          </Link>
          <p className="text-bg/60 text-sm">Set up in about two minutes. No card needed.</p>
        </div>
      </div>
    </section>
  );
}
