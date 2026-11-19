import { differenceInMinutes, format, isThisYear } from 'date-fns';

// Short text forms of a note for lists: its title, a snippet, a compact time.

// "now", "12m", "3h", "Tue", "4 Mar", "4 Mar 2025".
export function shortTime(iso) {
  const date = new Date(iso);
  const minutes = differenceInMinutes(new Date(), date);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 6 * 24 * 60) return format(date, 'EEE');
  return format(date, isThisYear(date) ? 'd MMM' : 'd MMM yyyy');
}

// The first words of a note, without the list and heading marks.
export function plainText(body) {
  return body
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^#+\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,})\s*$/gm, '')
    .replace(/\[([^\]\n]+)\]\{(?:\.[a-z]+ ?)+\}/g, '$1')
    .replace(/\+\+|==/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleOf(note) {
  return note.title || plainText(note.body).slice(0, 80) || 'Untitled';
}

// Words in a note's text (formatting marks don't count).
export function wordCount(body) {
  const text = plainText(body ?? '');
  return text ? text.split(/\s+/).length : 0;
}
