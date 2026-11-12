import { cn } from '../../lib/cn.js';

export function Logo({ className }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <defs>
          <linearGradient id="logo-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E9DCFF" />
            <stop offset="1" stopColor="#F8C9DD" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#logo-fill)" />
        <path
          d="M10 10h6M10 10v6M22 22h-6M22 22v-6"
          stroke="#16151B"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <rect x="13.5" y="13.5" width="5" height="5" rx="1.4" fill="#8B54E8" />
      </svg>
      <span className="font-display text-lg leading-none">FrameDesk</span>
    </span>
  );
}
