import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.jsx';

// Built on the native <dialog>: focus trapping, Escape and the backdrop come
// from the browser. Children only render while open, so forms start fresh.
export function Dialog({ open, onClose, title, description, wide = false, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function closeOnBackdrop(event) {
    if (event.target === dialogRef.current) onClose();
  }

  function closeOnEscape(event) {
    event.preventDefault();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={closeOnEscape}
      onClick={closeOnBackdrop}
      className={cn(
        'border-line/60 bg-surface text-ink m-auto w-[calc(100%-2rem)] rounded-3xl border p-0 shadow-2xl',
        'backdrop:bg-ink/30 backdrop:backdrop-blur-sm',
        wide === 'xl' ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto">
          <header className="border-line/70 bg-surface sticky top-0 z-10 flex items-start justify-between gap-4 border-b px-6 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="text-muted mt-0.5 text-sm">{description}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </header>
          <div className="px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function DialogActions({ children, start }) {
  return (
    <div className="border-line mt-6 flex items-center justify-between gap-3 border-t pt-4">
      <div>{start}</div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
