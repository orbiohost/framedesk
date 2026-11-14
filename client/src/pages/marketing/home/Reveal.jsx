import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/cn.js';

// Fades a block up into place the first time it scrolls into view.
export function Reveal({ as: Tag = 'div', delay = 0, className, children, ...props }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        'transition-[opacity,transform] duration-700 ease-out',
        shown ? 'opacity-100' : 'translate-y-5 opacity-0',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

// The small uppercase label above a section heading.
export function Eyebrow({ children, className }) {
  return (
    <p className={cn('text-muted mb-4 text-xs font-medium uppercase tracking-[0.16em]', className)}>
      {children}
    </p>
  );
}
