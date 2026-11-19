import { Eyebrow } from './Reveal.jsx';

// The heading at the top of a marketing page other than home.
export function PageIntro({ eyebrow, title, body }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-4 pt-16 text-center sm:px-6 md:pt-20">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="font-display mx-auto max-w-4xl text-balance text-4xl leading-tight tracking-tight md:text-6xl">
        {title}
      </h1>
      <p className="text-muted mx-auto mt-5 max-w-2xl text-lg leading-relaxed">{body}</p>
    </section>
  );
}
