import { ArrowRight, LayoutGrid, Plug, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../../lib/cn.js';
import { Reveal } from './Reveal.jsx';

const LINKS = [
  {
    to: '/ai',
    icon: Sparkles,
    tint: 'bg-lavender',
    title: 'The AI assistant',
    body: 'Transcripts, clip analysis and answers about your real projects.',
  },
  {
    to: '/ai#connectors',
    icon: Plug,
    tint: 'bg-mint',
    title: 'AI connectors',
    body: 'Let Claude, ChatGPT or Gemini work with your workspace.',
  },
  {
    to: '/features',
    icon: LayoutGrid,
    tint: 'bg-peach',
    title: 'How studios use it',
    body: 'Uploads, client review, freelancer access, tasks and the Android app.',
  },
];

// Home → the pages with the detail.
export function ExploreLinks() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <ul className="grid gap-4 md:grid-cols-3">
        {LINKS.map(({ to, icon: Icon, tint, title, body }, index) => (
          <Reveal as="li" key={to} delay={index * 70}>
            <Link
              to={to}
              className="border-line/70 bg-surface hover:shadow-lift group flex h-full flex-col rounded-3xl border p-5 transition-shadow"
            >
              <span
                className={cn('text-ink mb-4 grid h-10 w-10 place-items-center rounded-2xl', tint)}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-medium">{title}</span>
              <span className="text-muted mt-1.5 flex-1 text-sm leading-relaxed">{body}</span>
              <span className="text-accent mt-4 inline-flex items-center gap-1 text-sm font-medium">
                Learn more
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
