import { cn } from '../../lib/cn.js';

export function Skeleton({ className }) {
  return (
    <div className={cn('bg-subtle animate-pulse rounded-2xl', className)} aria-hidden="true" />
  );
}
