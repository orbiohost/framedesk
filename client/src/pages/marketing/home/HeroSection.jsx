import { ArrowRight, Captions, Check, Plug, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AI_GRADIENT, AI_TEXT } from '../../../features/ai/aiStyle.js';
import { cn } from '../../../lib/cn.js';
import { DashboardPreview } from './DashboardPreview.jsx';

const PROOF = [
  'Free plan with 1 GB',
  'No card needed',
  'AI included on every plan',
  'Hindi & English transcripts',
];

// Small cards that sit over the edges of the dashboard on wide screens.
function FloatingCard({ icon: Icon, title, detail, className, tint }) {
  return (
    <div
      className={cn(
        'border-line/70 bg-surface shadow-lift absolute z-10 hidden items-center gap-3 rounded-2xl border py-2.5 pl-2.5 pr-4 text-left xl:flex',
        'animate-[ai-float_5s_ease-in-out_infinite]',
        className,
      )}
    >
      <span className={cn('text-ink grid h-9 w-9 shrink-0 place-items-center rounded-xl', tint)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-[13px] font-semibold leading-tight">{title}</p>
        <p className="text-muted text-[11.5px] leading-tight">{detail}</p>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-x-clip">
      {/* A faint grid that fades out below the headline. */}
      <div
        className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[38rem]"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-14 text-center sm:px-6 md:pt-20">
        <a
          href="#tools"
          className="border-line/80 bg-surface/80 hover:border-accent/40 shadow-soft group mb-7 inline-flex max-w-full items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm backdrop-blur transition-colors"
        >
          <span
            className={cn(
              AI_GRADIENT,
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white',
            )}
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" /> New
          </span>
          <span className="truncate">
            New: Notes & Briefs, Moodboards, Social hub and AI Studio
          </span>
          <ArrowRight
            className="text-muted h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </a>

        <h1 className="font-display mx-auto max-w-5xl text-balance text-[2.6rem] leading-[1.04] tracking-tight sm:text-6xl md:text-7xl">
          Footage, files and feedback on one desk. <span className={AI_TEXT}>With an AI</span> that
          has seen it all.
        </h1>
        <p className="text-muted mx-auto mt-6 max-w-2xl text-lg leading-relaxed">
          FrameDesk keeps each project’s rushes, versions, tasks and client feedback together. The
          built-in assistant turns client calls into briefs, watches your clips and plans your
          posts, so you can ask what was said, what is ready and what to do next.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/signup"
            className="pill-active inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            Start free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/ai"
            className="border-line bg-surface hover:bg-subtle inline-flex items-center gap-2 rounded-full border px-6 py-3.5 text-sm font-semibold"
          >
            <Sparkles className="text-accent h-4 w-4" aria-hidden="true" />
            See the AI at work
          </Link>
        </div>
        <ul className="text-muted mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
          {PROOF.map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <Check className="text-success h-4 w-4" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>

        <div className="relative mt-16">
          {/* The assistant's colours, glowing behind the screen. */}
          <div
            className={cn(
              AI_GRADIENT,
              'pointer-events-none absolute inset-x-[8%] -top-6 bottom-10 rounded-[50%] opacity-25 blur-3xl dark:opacity-20',
            )}
            aria-hidden="true"
          />
          <FloatingCard
            icon={Captions}
            tint="bg-mint"
            title="Transcript ready"
            detail="Founder interview · 12 min · Hindi"
            className="-left-14 top-[27rem]"
          />
          <FloatingCard
            icon={Plug}
            tint="bg-lavender"
            title="Claude connected"
            detail="Reading Northlight Films over MCP"
            className="-right-10 -top-6 [animation-delay:1.2s]"
          />
          <div className="relative">
            <DashboardPreview />
          </div>
        </div>
      </div>
    </section>
  );
}
