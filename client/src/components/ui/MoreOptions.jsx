import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '../../lib/cn.js';

// Keeps the rarely-needed fields of a form out of the way until asked for.
// `forceOpen`: pass true when a hidden field has an error, so it can be seen.
export function MoreOptions({ label = 'More options', defaultOpen = false, forceOpen, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();
  const open = isOpen || Boolean(forceOpen);

  return (
    <div className="space-y-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setIsOpen(!open)}
        className="text-muted hover:text-ink -ml-1 inline-flex items-center gap-1 rounded-full px-1 text-[13px] font-medium transition-colors"
      >
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
        {label}
      </button>
      {open && (
        <div id={panelId} className="animate-[fade-in_160ms_ease-out] space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}
