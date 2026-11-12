import { cn } from '../../lib/cn.js';
import { formatBytes } from '../../lib/format.js';

const WARNING_RATIO = 0.9;

export function StorageMeter({ usedBytes, limitBytes, className }) {
  const ratio = limitBytes > 0 ? Math.min(usedBytes / limitBytes, 1) : 0;
  const nearlyFull = ratio >= WARNING_RATIO;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">Storage</span>
        <span className={cn('tabular-nums', nearlyFull ? 'text-danger' : 'text-muted')}>
          {formatBytes(usedBytes)} of {formatBytes(limitBytes)}
        </span>
      </div>
      <div
        className="bg-subtle h-1.5 overflow-hidden rounded-full"
        role="meter"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={limitBytes}
        aria-valuenow={usedBytes}
        aria-valuetext={`${formatBytes(usedBytes)} of ${formatBytes(limitBytes)} used`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            nearlyFull ? 'bg-danger' : 'bg-accent',
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
