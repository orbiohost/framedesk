import { Eyebrow, Reveal } from './Reveal.jsx';

const TODAY = [
  {
    title: 'The rushes are on a link that expired on Tuesday.',
    detail: 'So the client asks for them again, and you upload 40 GB a second time.',
  },
  {
    title: 'Feedback arrives as a voice note in a 14-person WhatsApp group.',
    detail: '"The bit near the end" could be any of six shots.',
  },
  {
    title: 'Nobody is sure whether v6 or final_FINAL_v2 went out.',
    detail: 'The approved cut lives on someone’s laptop, which is now in Goa.',
  },
  {
    title: 'The freelancer still has access to last year’s client folder.',
    detail: 'Because removing them from a shared drive is a job nobody remembers to do.',
  },
];

export function ProblemSection() {
  return (
    <section className="border-line bg-subtle/60 border-y">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Reveal>
          <Eyebrow>The way it works today</Eyebrow>
          <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
            The work is good. Everything around it is scattered.
          </h2>
        </Reveal>
        <Reveal as="ol" delay={100} className="divide-line divide-y">
          {TODAY.map((item, index) => (
            <li key={item.title} className="flex gap-6 py-5 first:pt-0">
              <span className="font-display text-muted text-2xl leading-none">0{index + 1}</span>
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-muted mt-1 text-sm">{item.detail}</p>
              </div>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
