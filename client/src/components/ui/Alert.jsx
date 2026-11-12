import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const TONES = {
  error: { icon: CircleAlert, className: 'border-danger/30 bg-danger/5 text-danger' },
  success: { icon: CircleCheck, className: 'border-success/30 bg-success/5 text-success' },
  info: { icon: Info, className: 'border-line bg-subtle text-ink' },
};

export function Alert({ tone = 'info', children, className }) {
  const { icon: Icon, className: toneClassName } = TONES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm',
        toneClassName,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
