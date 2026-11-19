import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { AI_GRADIENT } from './aiStyle.js';

// Colours a custom assistant can wear (the server allows the same names).
export const AGENT_COLORS = {
  violet: 'bg-gradient-to-br from-violet-500 to-fuchsia-500',
  blue: 'bg-gradient-to-br from-sky-500 to-indigo-500',
  teal: 'bg-gradient-to-br from-teal-400 to-cyan-600',
  green: 'bg-gradient-to-br from-emerald-400 to-green-600',
  amber: 'bg-gradient-to-br from-amber-400 to-orange-500',
  rose: 'bg-gradient-to-br from-rose-400 to-pink-600',
  slate: 'bg-gradient-to-br from-slate-500 to-slate-700',
};

const SIZES = {
  sm: 'h-6 w-6 text-[12px]',
  md: 'h-7 w-7 text-[14px]',
  lg: 'h-10 w-10 text-[18px]',
  xl: 'h-14 w-14 text-[26px]',
};
const ICON_SIZES = { sm: 'h-3 w-3', md: 'h-3.5 w-3.5', lg: 'h-5 w-5', xl: 'h-6 w-6' };

// A round avatar for an assistant: its emoji (or first letter) on its colour.
// No agent: the default FrameDesk AI sparkle.
export function AgentBadge({ agent, size = 'md', className }) {
  return (
    <span
      className={cn(
        'relative grid shrink-0 select-none place-items-center rounded-full font-semibold leading-none text-white',
        agent ? (AGENT_COLORS[agent.color] ?? AGENT_COLORS.violet) : AI_GRADIENT,
        SIZES[size],
        className,
      )}
      aria-hidden="true"
    >
      {!agent ? (
        <Sparkles className={ICON_SIZES[size]} />
      ) : agent.emoji ? (
        <span>{agent.emoji}</span>
      ) : (
        <span>{agent.name?.charAt(0).toUpperCase() || '?'}</span>
      )}
    </span>
  );
}
