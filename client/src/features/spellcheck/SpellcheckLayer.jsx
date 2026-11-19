import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  loadSpellchecker,
  misspelledRanges,
  onSpellcheckerChange,
  spellcheckerReady,
} from '../../lib/spellcheck.js';
import { SpellMenu } from './SpellMenu.jsx';

// Copied from the textarea so the invisible copy wraps exactly like it.
const COPIED = [
  'boxSizing',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopLeftRadius',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariantLigatures',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'wordSpacing',
  'tabSize',
  'textAlign',
  'direction',
];

// Typing in a textarea (fires real input events, so React state and
// react-hook-form both see it).
function replaceText(textarea, start, end, replacement) {
  const next = textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;
  setter?.call(textarea, next);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
  const caret = start + replacement.length;
  textarea.setSelectionRange(caret, caret);
}

/**
 * Spell checking for a plain textarea: put it right after the textarea, inside
 * the same `relative` wrapper. It draws red wavy underlines in an invisible
 * copy laid over the textarea, and clicking an underlined word offers fixes.
 * The browser's own checker is switched off on that textarea, so lines never
 * show twice. Pass `value` when the textarea is controlled.
 */
export function SpellcheckLayer({ textareaRef, value }) {
  const layer = useRef(null);
  const [text, setText] = useState('');
  const [typingAt, setTypingAt] = useState(-1);
  const [box, setBox] = useState(null);
  const [menu, setMenu] = useState(null);
  const [, setVersion] = useState(0);
  const ranges = spellcheckerReady() ? misspelledRanges(text, { skipAt: typingAt }) : [];
  const closeMenu = useCallback(() => setMenu(null), []);

  // `value` (for controlled textareas) can change without an input event (a reset).
  useLayoutEffect(() => {
    const current = textareaRef.current?.value ?? '';
    if (current !== text) setText(current);
  }, [textareaRef, text, value]);

  useEffect(() => {
    loadSpellchecker().catch(() => {});
    return onSpellcheckerChange(() => setVersion((version) => version + 1));
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return undefined;
    textarea.spellcheck = false;

    const measure = () => {
      const style = window.getComputedStyle(textarea);
      const copied = Object.fromEntries(COPIED.map((property) => [property, style[property]]));
      const borders =
        Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
      const scrollbar = Math.max(0, textarea.offsetWidth - textarea.clientWidth - borders);
      setBox({
        ...copied,
        top: textarea.offsetTop,
        left: textarea.offsetLeft,
        width: textarea.offsetWidth,
        height: textarea.offsetHeight,
        paddingRight: `${Number.parseFloat(style.paddingRight) + scrollbar}px`,
      });
    };
    const syncScroll = () => {
      if (layer.current) layer.current.scrollTop = textarea.scrollTop;
    };
    const onInput = () => {
      setText(textarea.value);
      setTypingAt(textarea.selectionStart === textarea.selectionEnd ? textarea.selectionStart : -1);
      setMenu(null);
    };
    // Moving the caret away finishes the word being typed.
    const onCaret = (event) => {
      if (event.type === 'keyup' && !event.key.startsWith('Arrow')) return;
      setTypingAt(-1);
    };
    const onBlur = () => setTypingAt(-1);
    const onFocus = () => setText(textarea.value);

    measure();
    const observer = new ResizeObserver(() => {
      measure();
      syncScroll();
    });
    observer.observe(textarea);
    textarea.addEventListener('input', onInput);
    textarea.addEventListener('scroll', syncScroll);
    textarea.addEventListener('mouseup', onCaret);
    textarea.addEventListener('keyup', onCaret);
    textarea.addEventListener('blur', onBlur);
    textarea.addEventListener('focus', onFocus);
    return () => {
      textarea.removeEventListener('focus', onFocus);
      observer.disconnect();
      textarea.removeEventListener('input', onInput);
      textarea.removeEventListener('scroll', syncScroll);
      textarea.removeEventListener('mouseup', onCaret);
      textarea.removeEventListener('keyup', onCaret);
      textarea.removeEventListener('blur', onBlur);
    };
  }, [textareaRef]);

  // A click inside an underlined word opens its suggestions.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return undefined;
    const onClick = () => {
      if (textarea.selectionStart !== textarea.selectionEnd) return;
      const caret = textarea.selectionStart;
      const current = misspelledRanges(textarea.value);
      const index = current.findIndex((range) => caret >= range.start && caret <= range.end);
      if (index < 0) return;
      const range = current[index];
      const marks = layer.current?.querySelectorAll('[data-spell]') ?? [];
      const mark = [...marks].find((element) => Number(element.dataset.spell) === range.start);
      if (!mark) return;
      setMenu({ ...range, rect: mark.getBoundingClientRect() });
    };
    textarea.addEventListener('click', onClick);
    return () => textarea.removeEventListener('click', onClick);
  }, [textareaRef]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (layer.current && textarea) layer.current.scrollTop = textarea.scrollTop;
  });

  if (!box) return null;
  const parts = [];
  let at = 0;
  for (const range of ranges) {
    parts.push(text.slice(at, range.start));
    parts.push(
      <span key={range.start} data-spell={range.start} className="spell-error">
        {text.slice(range.start, range.end)}
      </span>,
    );
    at = range.end;
  }
  parts.push(text.slice(at));

  return (
    <>
      <div
        ref={layer}
        aria-hidden="true"
        className="spell-layer pointer-events-none absolute overflow-hidden"
        style={box}
      >
        {parts}
        {/* Keeps a trailing new line from collapsing. */}
        {'​'}
      </div>
      <SpellMenu
        menu={menu}
        onClose={closeMenu}
        onPick={(replacement) => {
          const textarea = textareaRef.current;
          if (textarea && menu) replaceText(textarea, menu.start, menu.end, replacement);
        }}
      />
    </>
  );
}
