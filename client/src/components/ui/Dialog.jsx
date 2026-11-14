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

  // Ctrl/Cmd + Enter saves from anywhere in the form, including a textarea.
  function submitOnShortcut(event) {
    // A field that already handled the shortcut (the note editor) has prevented the default.
    if (event.defaultPrevented) return;
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    const form = dialogRef.current.querySelector('form');
    if (!form) return;
    event.preventDefault();
    form.requestSubmit();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={closeOnEscape}
      onClick={closeOnBackdrop}
      onKeyDown={submitOnShortcut}
      className={cn(
        'dialog-panel border-line/70 bg-surface text-ink overflow-hidden border p-0 shadow-2xl',
        // Phones: a sheet along the bottom edge, full width. Larger: centred.
        'mx-0 mb-0 mt-auto w-full max-w-none rounded-t-[22px] pb-[env(safe-area-inset-bottom)] sm:m-auto sm:w-[calc(100%-1.5rem)] sm:rounded-[22px] sm:pb-0',
        wide === 'xl' ? 'sm:max-w-5xl' : wide ? 'sm:max-w-xl' : 'sm:max-w-lg',
      )}
    >
      {open && (
        <div className="scrollbar-thin max-h-[88dvh] overflow-y-auto">
          <header className="bg-surface sticky top-0 z-10 flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-[17px] font-semibold tracking-tight">
                {title}
              </h2>
              {description && <p className="text-muted mt-0.5 truncate text-sm">{description}</p>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </header>
          <div className="px-6 pb-5 pt-2">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// The footer stays pinned to the bottom of the dialog while a long form scrolls.
// The `!` margins win over a parent's `space-y-*`.
export function DialogActions({ children, start }) {
  return (
    <div className="border-line/70 bg-surface sticky bottom-0 z-10 -mx-6 !-mb-5 !mt-6 flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3.5">
      <div className="min-w-0">{start}</div>
      <div className="ml-auto flex gap-2">{children}</div>
    </div>
  );
}
