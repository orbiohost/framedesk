import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// A small toolbar over text selected inside an AI answer ([data-ai-answer]
// within `containerRef`). actions: [{ label, icon: Icon, onPick(text) }].
export function SelectionMenu({ containerRef, actions }) {
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    let timer;
    function read() {
      const current = window.getSelection();
      const container = containerRef.current;
      if (!current || current.isCollapsed || current.rangeCount === 0 || !container) {
        setSelection(null);
        return;
      }
      const range = current.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      const answer = element?.closest('[data-ai-answer]');
      const text = current.toString().trim();
      if (!answer || !container.contains(answer) || text.length < 2) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelection({ text, x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
    }
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(read, 150);
    };
    const hide = () => setSelection(null);
    document.addEventListener('selectionchange', onChange);
    const container = containerRef.current;
    container?.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
      container?.removeEventListener('scroll', hide);
      window.removeEventListener('resize', hide);
    };
  }, [containerRef]);

  if (!selection) return null;
  // On touch screens the phone's own copy menu sits above the text: go below.
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  const below = touch || selection.top < 64;
  const width = Math.min(actions.length * 112, window.innerWidth - 16);
  const left = Math.min(
    Math.max(8, selection.x - width / 2),
    Math.max(8, window.innerWidth - width - 8),
  );
  const style = below
    ? { left, top: Math.min(selection.bottom + 10, window.innerHeight - 52) }
    : { left, top: selection.top - 48 };

  function pick(action) {
    const { text } = selection;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    action.onPick(text);
  }

  return createPortal(
    <div
      role="toolbar"
      aria-label="Selected text"
      style={style}
      className="bg-ink text-surface fixed z-[1000] flex animate-[ai-rise_140ms_ease-out_both] items-center gap-0.5 rounded-full p-1 shadow-xl"
      // Keep the selection while a button is pressed.
      onMouseDown={(event) => event.preventDefault()}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => pick(action)}
          className="hover:bg-surface/15 inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium transition-colors"
        >
          <action.icon className="h-3.5 w-3.5" aria-hidden="true" />
          {action.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
