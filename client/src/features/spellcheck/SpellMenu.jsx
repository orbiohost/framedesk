import { BookPlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { addToDictionary, suggestionsFor } from '../../lib/spellcheck.js';

const WIDTH = 220;

/**
 * Suggestions for one misspelled word, under it. menu: { word, rect } (rect
 * from getBoundingClientRect). onPick(replacement); onClose().
 */
export function SpellMenu({ menu, onPick, onClose }) {
  const box = useRef(null);
  const suggestions = useMemo(() => (menu ? suggestionsFor(menu.word) : []), [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const outside = (event) => {
      if (!box.current?.contains(event.target)) onClose();
    };
    const key = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const left = Math.max(8, Math.min(menu.rect.left, window.innerWidth - WIDTH - 8));
  const below = menu.rect.bottom + 6;
  const top = below + 220 > window.innerHeight ? Math.max(8, menu.rect.top - 226) : below;

  return createPortal(
    <div
      ref={box}
      role="menu"
      aria-label={`Spelling of "${menu.word}"`}
      style={{ top, left, width: WIDTH }}
      className="border-line bg-surface shadow-lift fixed z-[90] overflow-hidden rounded-xl border py-1 text-sm"
      // Keeps the focus (and caret) in the editor.
      onMouseDown={(event) => event.preventDefault()}
    >
      <p className="text-muted flex items-center justify-between px-3 py-1 text-[11px]">
        <span className="truncate">
          Spelling: <span className="text-danger line-through">{menu.word}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="hover:text-ink -mr-1 rounded p-0.5"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </p>
      {suggestions.length === 0 && <p className="text-muted px-3 py-1.5 text-xs">No suggestions</p>}
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          role="menuitem"
          onClick={() => {
            onPick(matchCase(menu.word, suggestion));
            onClose();
          }}
          className="hover:bg-subtle block w-full truncate px-3 py-1.5 text-left font-medium"
        >
          {matchCase(menu.word, suggestion)}
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          addToDictionary(menu.word);
          onClose();
        }}
        className="text-muted hover:bg-subtle hover:text-ink border-line/70 mt-1 flex w-full items-center gap-2 border-t px-3 py-1.5 text-left text-xs"
      >
        <BookPlus className="h-3.5 w-3.5" aria-hidden="true" />
        Add to my dictionary
      </button>
    </div>,
    document.body,
  );
}

// "Teh" → "The", "teh" → "the".
function matchCase(original, suggestion) {
  if (/^[A-Z]/.test(original) && /^[a-z]/.test(suggestion)) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}
