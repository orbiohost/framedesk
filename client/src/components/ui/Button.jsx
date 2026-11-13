import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const VARIANTS = {
  primary: 'pill-active enabled:hover:opacity-90',
  accent: 'bg-accent text-accent-ink enabled:hover:bg-accent/90',
  secondary: 'border border-line bg-surface text-ink shadow-sm enabled:hover:bg-subtle',
  ghost: 'text-muted enabled:hover:bg-subtle enabled:hover:text-ink',
  danger: 'border border-danger/30 text-danger enabled:hover:bg-danger/10',
};

const SIZES = {
  sm: 'h-8 px-3.5 text-sm',
  md: 'h-10 px-5 text-sm',
  // Square, for a lone icon (give it an aria-label).
  icon: 'h-8 w-8 text-sm',
  'icon-md': 'h-10 w-10 text-sm',
};

// While loading, the label stays in place (invisible) under the spinner, so the
// button keeps its width and an icon in the label doesn't sit next to the spinner.
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}) {
  return (
    <button
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium',
        'transition-[background-color,border-color,color,opacity,box-shadow,transform] duration-150 ease-out',
        'enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60',
        '[&_svg]:shrink-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <span className="absolute inset-0 grid place-items-center">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
