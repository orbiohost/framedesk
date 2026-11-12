import { cn } from '../../lib/cn.js';

const TONES = {
  neutral: 'border-line bg-subtle text-ink',
  muted: 'border-line text-muted',
  accent: 'border-transparent bg-lavender text-accent dark:text-ink',
  success: 'border-success/30 bg-success/10 text-success',
  danger: 'border-danger/30 bg-danger/10 text-danger',
};

export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
