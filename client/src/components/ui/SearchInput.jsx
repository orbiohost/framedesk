import { Search } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export function SearchInput({ value, onChange, placeholder, label, className }) {
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{label}</span>
      <Search
        className="text-muted pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="border-line bg-surface placeholder:text-muted/70 focus-visible:border-accent/60 focus-visible:ring-accent/15 h-10 w-full rounded-full border pl-10 pr-4 text-sm transition-shadow focus-visible:ring-[3px]"
      />
    </label>
  );
}
