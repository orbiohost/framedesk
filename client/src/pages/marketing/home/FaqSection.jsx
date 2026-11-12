import { Plus } from 'lucide-react';

const QUESTIONS = [
  {
    q: 'What counts toward my storage?',
    a: 'Every file you upload, including older versions and files in Trash. Trash empties itself after 30 days, and you can empty it sooner to free space straight away.',
  },
  {
    q: 'What happens when I run out of space?',
    a: 'New uploads pause until you free some space or add a storage pack. Nothing is ever deleted for you, and everyone can still view and download.',
  },
  {
    q: 'Do my clients need an account?',
    a: 'No. Send them a review link, with a password and an expiry date if you like. They can watch, leave timestamped notes and approve a version.',
  },
  {
    q: 'Can freelancers see all my clients?',
    a: 'Only if you let them. You can limit any member to specific projects and choose exactly what they can do there: upload, download, rename, delete or comment.',
  },
  {
    q: 'What if a payment fails?',
    a: 'You get 7 days to sort it out with full access. After that the workspace becomes read-only until payment goes through. Your files stay put.',
  },
  {
    q: 'How does the trial work?',
    a: 'Seven days on Starter with 5 GB of storage, no card needed. Pick a plan whenever you are ready; your projects carry over.',
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="border-line scroll-mt-20 border-t">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
          Questions studios ask us
        </h2>
        <div className="divide-line border-line divide-y border-y">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus
                  className="text-muted h-4 w-4 shrink-0 transition-transform group-open:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <p className="text-muted mt-3 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
