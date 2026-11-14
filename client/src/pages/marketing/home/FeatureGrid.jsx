import {
  ArchiveRestore,
  CalendarDays,
  KanbanSquare,
  MessagesSquare,
  NotebookPen,
  Search,
  Share2,
  Users,
} from 'lucide-react';
import { cn } from '../../../lib/cn.js';
import { Eyebrow, Reveal } from './Reveal.jsx';

const FEATURES = [
  {
    icon: KanbanSquare,
    tint: 'bg-lavender',
    title: 'Task board',
    body: 'Tasks by status with priority, due dates and checklists, per project or across the studio.',
  },
  {
    icon: CalendarDays,
    tint: 'bg-peach',
    title: 'Calendar',
    body: 'Deadlines, shoots and review calls in one month view, with a join link on each meeting.',
  },
  {
    icon: Users,
    tint: 'bg-mint',
    title: 'Clients',
    body: 'Every client with their projects, contacts and files, so nothing lives in someone’s inbox.',
  },
  {
    icon: MessagesSquare,
    tint: 'bg-pink',
    title: 'Team chat',
    body: 'One shared conversation for the workspace, right on the dashboard.',
  },
  {
    icon: NotebookPen,
    tint: 'bg-peach',
    title: 'Quick notes',
    body: 'Jot a note or a to-do list from any screen. Dictate it if your hands are full.',
  },
  {
    icon: Search,
    tint: 'bg-lavender',
    title: 'Search everything',
    body: 'One search box for projects, tasks, clients, files and notes across the workspace.',
  },
  {
    icon: Share2,
    tint: 'bg-mint',
    title: 'Share links',
    body: 'Send a whole project or a few picked files by link, and stop sharing when the job is done.',
  },
  {
    icon: ArchiveRestore,
    tint: 'bg-pink',
    title: 'Backups',
    body: 'Download a backup of your workspace whenever you like, and restore from it later.',
  },
];

export function FeatureGrid() {
  return (
    <section className="border-line bg-subtle/60 border-y">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal className="mb-12 max-w-2xl">
          <Eyebrow>Everything else on the desk</Eyebrow>
          <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
            The studio admin, handled in the same place.
          </h2>
        </Reveal>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, tint, title, body }, index) => (
            <Reveal
              as="li"
              key={title}
              delay={(index % 4) * 70}
              className="border-line/70 bg-surface hover:shadow-lift rounded-3xl border p-5 transition-shadow"
            >
              <span
                className={cn('text-ink mb-4 grid h-10 w-10 place-items-center rounded-2xl', tint)}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="font-medium">{title}</h3>
              <p className="text-muted mt-1.5 text-sm leading-relaxed">{body}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
