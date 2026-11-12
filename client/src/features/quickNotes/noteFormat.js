// Notes are plain text with a little Markdown, so they read fine anywhere
// (backups, search) and stay easy to type:
//   ## Heading   **bold**   _italic_   ~~strike~~   `code`
//   - bullet     1. numbered     - [ ] to-do     - [x] done

const HEADING = /^(#{1,3}) (.*)$/;
const CHECK = /^(\s*)- \[( |x|X)\](?: (.*))?$/;
const BULLET = /^(\s*)[-*] (.*)$/;
const NUMBERED = /^(\s*)(\d+)[.)] (.*)$/;

// One line of a note as a block: heading, check, bullet, numbered, blank or text.
export function parseLine(line) {
  let match = line.match(HEADING);
  if (match) return { type: 'heading', level: match[1].length, text: match[2] };
  match = line.match(CHECK);
  if (match) {
    return {
      type: 'check',
      indent: match[1].length,
      checked: match[2] !== ' ',
      text: match[3] ?? '',
    };
  }
  match = line.match(BULLET);
  if (match) return { type: 'bullet', indent: match[1].length, text: match[2] };
  match = line.match(NUMBERED);
  if (match) {
    return { type: 'numbered', indent: match[1].length, number: Number(match[2]), text: match[3] };
  }
  if (!line.trim()) return { type: 'blank' };
  return { type: 'text', text: line };
}

export function checklistProgress(body) {
  let done = 0;
  let total = 0;
  for (const line of String(body ?? '').split('\n')) {
    const match = line.match(CHECK);
    if (!match) continue;
    total += 1;
    if (match[2] !== ' ') done += 1;
  }
  return { done, total };
}

// Ticks or unticks the to-do on line `lineIndex`.
export function toggleCheckLine(body, lineIndex) {
  const lines = body.split('\n');
  const match = lines[lineIndex]?.match(CHECK);
  if (!match) return body;
  const mark = match[2] === ' ' ? 'x' : ' ';
  lines[lineIndex] = lines[lineIndex].replace(/- \[( |x|X)\]/, `- [${mark}]`);
  return lines.join('\n');
}

// Editing helpers. Each takes the text and selection and returns the new text
// and selection, or null when there is nothing to do.

export function wrapSelection(value, start, end, marker, placeholder = 'text') {
  const before = value.slice(start - marker.length, start);
  const after = value.slice(end, end + marker.length);
  if (before === marker && after === marker) {
    return {
      value:
        value.slice(0, start - marker.length) +
        value.slice(start, end) +
        value.slice(end + marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }
  const text = value.slice(start, end) || placeholder;
  return {
    value: value.slice(0, start) + marker + text + marker + value.slice(end),
    start: start + marker.length,
    end: start + marker.length + text.length,
  };
}

const ANY_PREFIX = /^(\s*)(#{1,3} |- \[[ xX]\] ?|[-*] |\d+[.)] )/;
const HAS_PREFIX = {
  heading: /^#{1,3} /,
  bullet: /^\s*[-*] (?!\[[ xX]\])/,
  numbered: /^\s*\d+[.)] /,
  check: /^\s*- \[[ xX]\]/,
};

function prefixFor(kind, n) {
  if (kind === 'heading') return '## ';
  if (kind === 'bullet') return '- ';
  if (kind === 'numbered') return `${n}. `;
  return '- [ ] ';
}

// Turns the selected lines into a heading or list, or back to plain text when
// they all already are one.
export function toggleLinePrefix(value, start, end, kind) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = value.indexOf('\n', end > start && value[end - 1] === '\n' ? end - 1 : end);
  if (lineEnd === -1) lineEnd = value.length;

  const lines = value.slice(lineStart, lineEnd).split('\n');
  const allHave =
    lines.some((line) => HAS_PREFIX[kind].test(line)) &&
    lines.every((line) => !line.trim() || HAS_PREFIX[kind].test(line));
  const strip = (line) => line.replace(ANY_PREFIX, '$1');
  let n = 0;
  const changed = lines.map((line) => {
    if (allHave) return strip(line);
    if (!line.trim() && lines.length > 1) return line;
    n += 1;
    const indent = kind === 'heading' ? '' : line.match(/^\s*/)[0];
    return indent + prefixFor(kind, n) + strip(line).trimStart();
  });

  const replaced = changed.join('\n');
  const next = value.slice(0, lineStart) + replaced + value.slice(lineEnd);
  if (lines.length === 1) {
    const delta = replaced.length - (lineEnd - lineStart);
    return {
      value: next,
      start: Math.max(lineStart, start + delta),
      end: Math.max(lineStart, end + delta),
    };
  }
  return { value: next, start: lineStart, end: lineStart + replaced.length };
}

const LIST_MARKER = /^(\s*)(- \[[ xX]\] |[-*] |(\d+)([.)]) )/;

// Enter inside a list starts the next item; Enter on an empty item ends the list.
export function continueList(value, start, end) {
  if (start !== end) return null;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = value.indexOf('\n', start);
  if (lineEnd === -1) lineEnd = value.length;
  const line = value.slice(lineStart, lineEnd);
  const match = line.match(LIST_MARKER);
  if (!match || start - lineStart < match[0].length) return null;

  if (!line.slice(match[0].length).trim()) {
    return {
      value: value.slice(0, lineStart) + value.slice(lineEnd),
      start: lineStart,
      end: lineStart,
    };
  }
  const [, indent, marker, number, separator] = match;
  let nextMarker = marker;
  if (number) nextMarker = `${Number(number) + 1}${separator} `;
  else if (marker.startsWith('- [')) nextMarker = '- [ ] ';
  const insert = `\n${indent}${nextMarker}`;
  return {
    value: value.slice(0, start) + insert + value.slice(end),
    start: start + insert.length,
    end: start + insert.length,
  };
}
