// Text colours and sizes a note can use. Stored in the note's text as a
// bracketed span: "[some words]{.red .lg}" (see noteFormat.js). The CSS for
// each class is in styles/index.css (.note-c-*, .note-s-*), with dark-mode tones.

export const TEXT_COLORS = [
  { key: 'red', label: 'Red' },
  { key: 'orange', label: 'Orange' },
  { key: 'green', label: 'Green' },
  { key: 'blue', label: 'Blue' },
  { key: 'purple', label: 'Purple' },
  { key: 'gray', label: 'Grey' },
];

export const TEXT_SIZES = [
  { key: 'sm', label: 'Small' },
  { key: null, label: 'Normal' },
  { key: 'lg', label: 'Large' },
  { key: 'xl', label: 'Huge' },
];

const COLOR_KEYS = new Set(TEXT_COLORS.map((color) => color.key));
const SIZE_KEYS = new Set(TEXT_SIZES.map((size) => size.key).filter(Boolean));

// ".red .lg" -> { color: 'red', size: 'lg' } (unknown classes are ignored).
export function parseStyleClasses(classes) {
  const style = { color: null, size: null };
  for (const name of classes.split(/\s+/)) {
    const key = name.replace(/^\./, '');
    if (COLOR_KEYS.has(key)) style.color = key;
    else if (SIZE_KEYS.has(key)) style.size = key;
  }
  return style;
}

// { color, size } -> ".red .lg", or '' when neither is set.
export function styleClasses({ color, size }) {
  return [color && `.${color}`, size && `.${size}`].filter(Boolean).join(' ');
}

export function styleClassNames({ color, size }) {
  return [color && `note-c-${color}`, size && `note-s-${size}`].filter(Boolean).join(' ');
}

// The "custom characters" picker: symbols people reach for in notes.
export const SYMBOL_GROUPS = [
  { label: 'Marks', symbols: ['✓', '✗', '•', '◦', '★', '☆', '♥', '⚑', '‼', '⁇', '†', '§', '¶'] },
  { label: 'Arrows', symbols: ['→', '←', '↑', '↓', '↔', '⇒', '⇐', '⇔', '↗', '↘', '↻', '⤴'] },
  {
    label: 'Maths',
    symbols: ['±', '×', '÷', '≈', '≠', '≤', '≥', '∞', '√', '°', '%', '‰', '½', '¼', '¾'],
  },
  { label: 'Money', symbols: ['₹', '$', '€', '£', '¥', '¢', '₿'] },
  { label: 'Text', symbols: ['…', '–', '—', '“', '”', '‘', '’', '«', '»', '©', '®', '™', '№'] },
  {
    label: 'Work',
    symbols: ['⏰', '📌', '📎', '📝', '✅', '❌', '⚠️', '💡', '🎬', '📷', '🎯', '🔥'],
  },
];
