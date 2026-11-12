import { useState } from 'react';
import { cn } from '../../lib/cn.js';

function initials(name) {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}

// Each person keeps the same pastel wherever their avatar appears.
const TINTS = ['bg-lavender', 'bg-pink', 'bg-peach', 'bg-mint'];

function tintFor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
};

const IMAGE_SIZES = {
  xs: 'h-6 w-6',
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
  xl: 'h-20 w-20',
};
SIZES.xl = 'h-20 w-20 text-xl';

// Shows the person's picture when they have one, their initials otherwise
// (also if the picture fails to load).
export function Avatar({ name, src, size = 'md', className }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt=""
        title={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(src)}
        className={cn(
          'ring-surface bg-subtle inline-block shrink-0 rounded-full object-cover ring-2',
          IMAGE_SIZES[size],
          className,
        )}
      />
    );
  }
  return (
    <span
      title={name}
      className={cn(
        'text-ink ring-surface inline-grid shrink-0 place-items-center rounded-full font-semibold ring-2',
        tintFor(name),
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

// Overlapping avatars with a "+N" count, as on task cards and the page header.
// `people` ({ name, avatarUrl }) shows pictures; plain `names` shows initials.
export function AvatarStack({ names, people, max = 3, size = 'md', className }) {
  const list = people ?? names.map((name) => ({ name }));
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <span className={cn('flex items-center', className)}>
      <span className={cn('flex', size === 'xs' || size === 'sm' ? '-space-x-1' : '-space-x-2')}>
        {shown.map((person, index) => (
          <Avatar
            key={`${person.name}-${index}`}
            name={person.name}
            src={person.avatarUrl}
            size={size}
          />
        ))}
      </span>
      {extra > 0 && <span className="text-muted ml-2 text-sm font-medium">+{extra}</span>}
    </span>
  );
}
