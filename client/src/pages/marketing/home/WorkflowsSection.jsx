import { cn } from '../../../lib/cn.js';
import { NotesSnippet, TeamSnippet, UploadSnippet } from './WorkflowSnippets.jsx';

const WORKFLOWS = [
  {
    label: 'Upload',
    title: 'Send a day of rushes and go home.',
    body: 'Drop in multi-gigabyte camera files. If the connection drops, the upload carries on from where it stopped instead of starting again. Files land in Raw, sorted by project.',
    snippet: UploadSnippet,
    caption: 'Uploads · Saffron Tea shoot, day 2',
  },
  {
    label: 'Review',
    title: 'Feedback pinned to the exact second.',
    body: 'Clients open a review link, play the cut, and leave notes on the timeline. You reply in a thread, upload v04, and mark the note resolved. No account needed on their side.',
    snippet: NotesSnippet,
    caption: 'NLT_BrandFilm_v03.mp4 · notes',
  },
  {
    label: 'Team',
    title: 'Freelancers see their project, nothing else.',
    body: 'Start from a role (Admin, Editor, Viewer, Client), then switch individual permissions on or off. Limit a freelancer to one project, and take access away when the job ends.',
    snippet: TeamSnippet,
    caption: 'Members · Northlight Films',
  },
];

function Workflow({ workflow, index }) {
  const Snippet = workflow.snippet;
  const isReversed = index % 2 === 1;

  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <div className={cn(isReversed && 'md:order-2')}>
        <p className="text-accent mb-3 text-xs font-medium uppercase tracking-[0.16em]">
          {String(index + 1).padStart(2, '0')} · {workflow.label}
        </p>
        <h3 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">
          {workflow.title}
        </h3>
        <p className="text-muted mt-4 leading-relaxed">{workflow.body}</p>
      </div>
      <figure className="border-line bg-surface overflow-hidden rounded-lg border">
        <figcaption className="border-line text-muted border-b px-5 py-2.5 text-xs">
          {workflow.caption}
        </figcaption>
        <Snippet />
      </figure>
    </div>
  );
}

export function WorkflowsSection() {
  return (
    <section id="workflows" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <h2 className="font-display mb-16 max-w-2xl text-4xl leading-tight tracking-tight md:text-5xl">
        Three things you do every week, done in one place.
      </h2>
      <div className="space-y-24">
        {WORKFLOWS.map((workflow, index) => (
          <Workflow key={workflow.label} workflow={workflow} index={index} />
        ))}
      </div>
    </section>
  );
}
