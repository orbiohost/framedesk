import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { SpellcheckLayer } from '../spellcheck/SpellcheckLayer.jsx';
import { fetchTransliteration } from './hooks.js';

// Languages Google Input Tools can suggest for (the server has the same list).
export const TRANSLITERATE_OPTIONS = [
  { value: '', label: 'Off (type as is)' },
  { value: 'hi', label: 'Hindi — हिन्दी' },
  { value: 'mr', label: 'Marathi — मराठी' },
  { value: 'bn', label: 'Bengali — বাংলা' },
  { value: 'gu', label: 'Gujarati — ગુજરાતી' },
  { value: 'pa', label: 'Punjabi — ਪੰਜਾਬੀ' },
  { value: 'ta', label: 'Tamil — தமிழ்' },
  { value: 'te', label: 'Telugu — తెలుగు' },
  { value: 'kn', label: 'Kannada — ಕನ್ನಡ' },
  { value: 'ml', label: 'Malayalam — മലയാളം' },
  { value: 'or', label: 'Odia — ଓଡ଼ିଆ' },
  { value: 'ur', label: 'Urdu — اردو' },
  { value: 'ne', label: 'Nepali — नेपाली' },
  { value: 'sa', label: 'Sanskrit — संस्कृतम्' },
];
export const TRANSLITERATE_CODES = new Set(TRANSLITERATE_OPTIONS.map((option) => option.value));

const DEBOUNCE_MS = 120;
// Typing one of these right after a word picks the highlighted suggestion first.
const ACCEPT_WITH = new Set([' ', ',', '.', '?', '!', ';', ':', '।']);

// Where the caret is inside a textarea, in pixels from its top-left corner:
// a hidden copy with the same styles is laid out up to the caret.
const MIRRORED = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'wordSpacing',
  'tabSize',
];

function caretCoordinates(textarea, index) {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const property of MIRRORED) mirror.style[property] = style[property];
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    top: '0',
    left: '-9999px',
  });
  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = textarea.value.slice(index) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4;
  const result = {
    top: marker.offsetTop - textarea.scrollTop + lineHeight,
    left: marker.offsetLeft - textarea.scrollLeft,
  };
  mirror.remove();
  return result;
}

// The English-letter word right before the caret, if any.
function wordBeforeCaret(value, caret) {
  const match = /[A-Za-z']+$/.exec(value.slice(0, caret));
  if (!match) return null;
  // Only while the caret is at the end of the word, not inside it.
  if (/[A-Za-z']/.test(value.charAt(caret))) return null;
  return { text: match[0], start: caret - match[0].length, end: caret };
}

/**
 * A textarea that, with a language picked, suggests the word being typed in
 * that language's script ("aapka" → "आपका") in a small list at the caret.
 * Space, punctuation, Enter or Tab pick the highlighted one; ↑/↓ move; Esc
 * keeps the English letters. Other keys go to onKeyDown as usual.
 */
export function TransliterateTextarea({
  workspaceId,
  language,
  value,
  onChange,
  onKeyDown,
  className,
  ...props
}) {
  const textarea = useRef(null);
  const listId = useId();
  const [word, setWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState(null);
  const [failed, setFailed] = useState(false);
  const pendingCaret = useRef(null);
  const open = Boolean(language && word && options.length > 0);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !textarea.current) return;
    textarea.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [value]);

  // Suggestions for the current word, a moment after the last key.
  useEffect(() => {
    if (!language || !word) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const suggestions = await fetchTransliteration(workspaceId, word.text, language);
        if (cancelled) return;
        setFailed(false);
        // The letters as typed stay available as the last choice.
        setOptions([...suggestions, word.text].filter((v, i, all) => all.indexOf(v) === i));
        setActive(0);
        if (textarea.current) setPosition(caretCoordinates(textarea.current, word.end));
      } catch {
        if (!cancelled) {
          setFailed(true);
          setOptions([]);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [workspaceId, language, word]);

  function track(element) {
    if (!language) return;
    const caret = element.selectionStart;
    const found = element.selectionEnd === caret ? wordBeforeCaret(element.value, caret) : null;
    const same = word?.text === found?.text && word?.start === found?.start;
    if (same) return;
    setWord(found);
    // Suggestions for another word never apply to this one.
    setOptions([]);
  }

  function close() {
    setWord(null);
    setOptions([]);
  }

  function accept(choice, extra = '') {
    if (!word) return;
    const next = value.slice(0, word.start) + choice + extra + value.slice(word.end);
    pendingCaret.current = word.start + choice.length + extra.length;
    close();
    onChange(next);
  }

  function handleKeyDown(event) {
    if (open && !event.nativeEvent.isComposing) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((current) => (current + step + options.length) % options.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        accept(options[active]);
        return;
      }
      if (ACCEPT_WITH.has(event.key)) {
        event.preventDefault();
        accept(options[active], event.key);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
    }
    onKeyDown?.(event);
  }

  return (
    <div className="relative">
      <textarea
        ref={textarea}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          track(event.target);
        }}
        onSelect={(event) => track(event.target)}
        onBlur={close}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        className={className}
        {...props}
      />
      <SpellcheckLayer textareaRef={textarea} value={value} />
      {open && position && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`Suggestions for "${word.text}"`}
          className="border-line bg-surface shadow-lift absolute z-30 min-w-32 max-w-[calc(100%-0.5rem)] overflow-hidden rounded-xl border py-1 text-sm"
          style={{ top: position.top + 4, left: Math.max(0, position.left - 8) }}
        >
          {options.map((option, index) => (
            <li
              key={option}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                accept(option);
              }}
              onMouseEnter={() => setActive(index)}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-1',
                index === active ? 'bg-accent/15 text-ink' : 'text-ink/90',
              )}
            >
              <span className="text-muted w-3 text-[11px] tabular-nums">{index + 1}</span>
              <span className={cn(index === options.length - 1 && 'text-muted italic')}>
                {option}
              </span>
            </li>
          ))}
          <li className="text-muted border-line/70 mt-1 border-t px-3 pt-1 text-[10px]">
            Space picks · ↑↓ choose · Esc keeps English
          </li>
        </ul>
      )}
      {failed && language && (
        <p className="text-muted mt-1 text-[11px]">Suggestions are unavailable right now.</p>
      )}
    </div>
  );
}
