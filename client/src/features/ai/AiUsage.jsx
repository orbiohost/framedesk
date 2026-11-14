import { Gauge } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { useNow } from '../../lib/useNow.js';

// "in 2 hr 13 min" / "in 4 min" / "Mon 9:30 AM".
export function resetLabel(resetsAt, now = Date.now()) {
  if (!resetsAt) return null;
  const ms = new Date(resetsAt).getTime() - now;
  if (ms <= 0) return 'now';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours} hr ${minutes % 60} min`;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(resetsAt));
}

function tone(percent) {
  if (percent >= 100) return { bar: 'bg-danger', text: 'text-danger', stroke: '#e13e32' };
  if (percent >= 80) return { bar: 'bg-warning', text: 'text-warning', stroke: '#d68c14' };
  return { bar: 'bg-accent', text: 'text-accent', stroke: 'url(#ai-usage-gradient)' };
}

// A small circular gauge of the current 5-hour session.
export function UsageRing({ percent, size = 22, className }) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('shrink-0 -rotate-90', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ai-usage-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="60%" stopColor="#c026d3" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-line"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        stroke={tone(clamped).stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
      />
    </svg>
  );
}

function UsageBar({ label, hint, window: usage, now }) {
  const colours = tone(usage.percent);
  const reset = resetLabel(usage.resetsAt, now);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <p className={cn('text-sm font-semibold tabular-nums', colours.text)}>{usage.percent}%</p>
      </div>
      <div className="bg-subtle mt-1.5 h-2 overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-out',
            colours.bar,
          )}
          style={{ width: `${Math.max(usage.percent, usage.percent > 0 ? 3 : 0)}%` }}
        />
      </div>
      <p className="text-muted mt-1 text-xs">
        {reset ? `Resets ${reset}` : `Starts with your next question · ${hint}`}
      </p>
    </div>
  );
}

// Both limits with their reset times, plus any extra usage.
export function UsageDetails({ credits, workspaceId, canBuy, className }) {
  const now = useNow(30_000);
  return (
    <div className={cn('space-y-4', className)}>
      <UsageBar
        label="Current session"
        hint={`${credits.session.hours}-hour window`}
        window={credits.session}
        now={now}
      />
      <UsageBar
        label="Weekly limit"
        hint={`${credits.weekly.days}-day window`}
        window={credits.weekly}
        now={now}
      />
      {(credits.extra > 0 || canBuy) && (
        <div className="border-line/70 flex items-center justify-between gap-3 border-t pt-3 text-sm">
          <span className="text-muted">
            Extra usage{' '}
            <span className="text-ink font-medium tabular-nums">
              {credits.extra.toLocaleString('en-IN')}
            </span>{' '}
            credits
          </span>
          {canBuy && (
            <Link
              to={`/w/${workspaceId}/upgrade#ai-credits`}
              className="text-accent text-xs font-medium hover:underline"
            >
              Get more
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// The ring in the chat header; opens the details on click.
export function UsageButton({ credits, workspaceId, canBuy, action }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const percent = credits.session.percent;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Usage: ${percent}% of this session, ${credits.weekly.percent}% of this week`}
        className="hover:bg-subtle flex h-8 items-center gap-1.5 rounded-full pl-1.5 pr-2.5 transition-colors"
      >
        <UsageRing percent={percent} size={20} />
        <span className={cn('text-xs font-medium tabular-nums', tone(percent).text)}>
          {percent}%
        </span>
      </button>
      {open && (
        <div className="border-line/70 bg-surface shadow-lift absolute right-0 top-full z-20 mt-2 w-72 animate-[menu-in_140ms_ease-out] rounded-2xl border p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Gauge className="text-accent h-4 w-4" aria-hidden="true" />
            AI usage
          </p>
          <UsageDetails credits={credits} workspaceId={workspaceId} canBuy={canBuy} />
          {action && <div className="mt-4">{action}</div>}
        </div>
      )}
    </div>
  );
}

// Shown in place of the question box when a limit is reached.
export function LimitReached({ credits, workspaceId, canBuy, action }) {
  const now = useNow(30_000);
  const weekly = credits.limitedBy === 'weekly';
  const window = weekly ? credits.weekly : credits.session;
  const reset = resetLabel(window.resetsAt, now);
  return (
    <div className="border-warning/30 bg-warning/5 mx-3 mb-1 mt-3 flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-sm">
      <UsageRing percent={100} size={22} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {weekly ? 'Weekly limit reached' : '5-hour limit reached'}
          {reset && <span className="text-muted font-normal"> · resets {reset}</span>}
        </p>
        <p className="text-muted mt-0.5">
          {canBuy ? (
            <>
              <Link
                to={`/w/${workspaceId}/upgrade#ai-credits`}
                className="text-ink font-medium underline underline-offset-2"
              >
                Get extra usage
              </Link>{' '}
              to keep going now.
            </>
          ) : (
            'Ask the workspace owner for extra usage to keep going now.'
          )}
        </p>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}
