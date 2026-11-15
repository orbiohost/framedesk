import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AI_GRADIENT } from '../../../features/ai/aiStyle.js';
import { cn } from '../../../lib/cn.js';

// Dark in both themes, like the connectors panel, so its colours are fixed.
export function FinalCta() {
  return (
    <section className="relative mx-3 mb-6 overflow-hidden rounded-[36px] bg-[#16151b] text-white sm:mx-5">
      <div
        className={cn(
          AI_GRADIENT,
          'pointer-events-none absolute -bottom-56 left-1/2 h-[26rem] w-[60rem] max-w-none -translate-x-1/2 rounded-[50%] opacity-40 blur-3xl',
        )}
        aria-hidden="true"
      />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <span
          className={cn(
            AI_GRADIENT,
            'mb-7 grid h-14 w-14 animate-[ai-float_4s_ease-in-out_infinite] place-items-center rounded-full',
          )}
        >
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="font-display text-4xl leading-tight tracking-tight md:text-6xl">
          Put your next project on the desk.
        </h2>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/65">
          Upload a shoot, invite your editor, and ask the assistant your first question today.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#16151b] transition-transform hover:-translate-y-0.5"
          >
            Start free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a
            href="#pricing"
            className="rounded-full border border-white/20 px-6 py-3.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            See pricing
          </a>
        </div>
        <p className="mt-5 text-sm text-white/50">Set up in about two minutes. No card needed.</p>
      </div>
    </section>
  );
}
