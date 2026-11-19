import { parseLine } from './noteFormat.js';
import { parseStyleClasses, styleClasses } from './noteStyles.js';

// Converts between a note's stored text (the light Markdown described in
// noteFormat.js) and the rich editor's document. Notes stay plain text on the
// server, so search, #tags, backups and ticking to-dos on a card keep working;
// only the writing experience is rich.

const INDENT = 2; // spaces per nesting level in the stored text
const LIST_NODES = {
  bullet: { list: 'bulletList', item: 'listItem' },
  numbered: { list: 'orderedList', item: 'listItem' },
  check: { list: 'taskList', item: 'taskItem' },
};

// Outermost first. The same marks, in the same spelling, that NoteMarkdown reads.
// Colour and size are written as one bracketed span around them: [text]{.red .lg}.
const MARKS = [
  ['bold', '**'],
  ['strike', '~~'],
  ['italic', '_'],
  ['underline', '++'],
  ['highlight', '=='],
  ['code', '`'],
];
const MARKER = Object.fromEntries(MARKS);
const STYLE = 'style:';

export const INLINE_SOURCE = [
  String.raw`(?<style>\[(?<styleText>[^\]\n]+)\]\{(?<styleCls>\.[a-z]+(?: \.[a-z]+)*)\})`,
  String.raw`(?<bold>\*\*(?<boldText>[^*\n]+?)\*\*)`,
  String.raw`(?<under>\+\+(?<underText>[^+\n]+?)\+\+)`,
  String.raw`(?<hl>==(?<hlText>[^=\n]+?)==)`,
  String.raw`(?<strike>~~(?<strikeText>[^~\n]+?)~~)`,
  String.raw`(?<code>\x60(?<codeText>[^\x60\n]+?)\x60)`,
  String.raw`(?<italic>(?<![\p{L}\p{N}_*])[_*](?<italicText>[^\s_*][^_*\n]*?)[_*](?![\p{L}\p{N}_*]))`,
];
const INLINE = new RegExp(INLINE_SOURCE.join('|'), 'gu');

// marks: [{ type, attrs? }]; a later mark of the same type wins.
function textNode(text, marks) {
  if (marks.length === 0) return { type: 'text', text };
  const byType = new Map(marks.map((mark) => [mark.type, mark]));
  return { type: 'text', text, marks: [...byType.values()] };
}

function inlineNodes(text, marks = []) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const { groups } = match;
    if (match.index > last) nodes.push(textNode(text.slice(last, match.index), marks));
    last = match.index + match[0].length;
    if (groups.style) {
      const { color, size } = parseStyleClasses(groups.styleCls);
      const added = [
        color && { type: 'textColor', attrs: { color } },
        size && { type: 'textSize', attrs: { size } },
      ].filter(Boolean);
      nodes.push(...inlineNodes(groups.styleText, [...marks, ...added]));
    } else if (groups.bold)
      nodes.push(...inlineNodes(groups.boldText, [...marks, { type: 'bold' }]));
    else if (groups.under) {
      nodes.push(...inlineNodes(groups.underText, [...marks, { type: 'underline' }]));
    } else if (groups.hl) {
      nodes.push(...inlineNodes(groups.hlText, [...marks, { type: 'highlight' }]));
    } else if (groups.strike) {
      nodes.push(...inlineNodes(groups.strikeText, [...marks, { type: 'strike' }]));
    } else if (groups.italic) {
      nodes.push(...inlineNodes(groups.italicText, [...marks, { type: 'italic' }]));
    } else nodes.push(textNode(groups.codeText, [...marks, { type: 'code' }]));
  }
  if (last < text.length) nodes.push(textNode(text.slice(last), marks));
  return nodes;
}

function paragraph(text) {
  const content = inlineNodes(text ?? '');
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

// A run of list lines becomes nested lists: deeper indent nests under the item above.
function buildList(items, start, level) {
  const first = items[start];
  const names = LIST_NODES[first.type];
  const list = { type: names.list, content: [] };
  if (first.type === 'numbered' && first.number !== 1) list.attrs = { start: first.number };

  let index = start;
  while (index < items.length && items[index].level >= level) {
    const item = items[index];
    if (item.level > level) {
      const [nested, next] = buildList(items, index, level + 1);
      list.content.at(-1).content.push(nested);
      index = next;
    } else if (item.type !== first.type) {
      break;
    } else {
      const node = { type: names.item, content: [paragraph(item.text)] };
      if (item.type === 'check') node.attrs = { checked: item.checked };
      list.content.push(node);
      index += 1;
    }
  }
  return [list, index];
}

function listBlocks(lines) {
  // Levels can only step in one at a time, and the run starts at the margin.
  let previous = -1;
  const items = lines.map((line) => {
    const level = Math.min(Math.floor(line.indent / INDENT), previous + 1);
    previous = level;
    return { ...line, level };
  });
  const blocks = [];
  let index = 0;
  while (index < items.length) {
    const [list, next] = buildList(items, index, items[index].level);
    blocks.push(list);
    index = next;
  }
  return blocks;
}

/** Stored text -> editor document. */
export function noteToDoc(text) {
  const content = [];
  let run = [];
  let quote = [];
  const flush = () => {
    if (run.length > 0) content.push(...listBlocks(run));
    run = [];
  };
  const flushQuote = () => {
    if (quote.length > 0) {
      content.push({ type: 'blockquote', content: quote.map((line) => paragraph(line)) });
    }
    quote = [];
  };
  for (const line of String(text ?? '').split('\n')) {
    const parsed = parseLine(line);
    if (parsed.type in LIST_NODES) {
      flushQuote();
      run.push(parsed);
      continue;
    }
    flush();
    if (parsed.type === 'quote') {
      quote.push(parsed.text);
      continue;
    }
    flushQuote();
    if (parsed.type === 'divider') {
      content.push({ type: 'horizontalRule' });
      continue;
    }
    if (parsed.type === 'heading') {
      const inline = inlineNodes(parsed.text);
      content.push({
        type: 'heading',
        attrs: { level: parsed.level },
        ...(inline.length > 0 && { content: inline }),
      });
    } else {
      content.push(paragraph(parsed.type === 'text' ? parsed.text : ''));
    }
  }
  flush();
  flushQuote();
  return { type: 'doc', content };
}

// The marks a text node is written with, outermost first: its colour/size span
// (as one "style:" key), then the simple marks in MARKS order.
function wantedMarks(node) {
  const marks = node.marks ?? [];
  const color = marks.find((mark) => mark.type === 'textColor')?.attrs?.color ?? null;
  const size = marks.find((mark) => mark.type === 'textSize')?.attrs?.size ?? null;
  const classes = styleClasses({ color, size });
  return [
    ...(classes ? [STYLE + classes] : []),
    ...MARKS.map(([type]) => type).filter((type) => marks.some((mark) => mark.type === type)),
  ];
}

const opener = (key) => (key.startsWith(STYLE) ? '[' : MARKER[key]);
const closer = (key) => (key.startsWith(STYLE) ? `]{${key.slice(STYLE.length)}}` : MARKER[key]);

// Inline content -> text. Marks are opened and closed as a stack, and spaces at
// the edge of a marked run are kept outside the markers ("**bold** next").
function inlineText(content = []) {
  let out = '';
  let open = [];
  let pending = ''; // trailing spaces not yet written

  const closeTo = (keep) => {
    for (let i = open.length - 1; i >= keep; i -= 1) out += closer(open[i]);
    open = open.slice(0, keep);
  };

  for (const node of content) {
    if (node.type === 'hardBreak') {
      closeTo(0);
      out += '\n';
      pending = '';
      continue;
    }
    const text = node.text ?? '';
    const core = text.trim();
    if (!core) {
      pending += text;
      continue;
    }
    const want = wantedMarks(node);
    let keep = 0;
    while (keep < open.length && keep < want.length && open[keep] === want[keep]) keep += 1;
    closeTo(keep);
    out += pending + text.slice(0, text.indexOf(core));
    for (const key of want.slice(keep)) out += opener(key);
    open = want;
    out += core;
    pending = text.slice(text.indexOf(core) + core.length);
  }
  closeTo(0);
  return out + pending;
}

function blockLines(node, indent = '') {
  if (node.type === 'paragraph') {
    return inlineText(node.content)
      .split('\n')
      .map((line) => indent + line);
  }
  if (node.type === 'horizontalRule') return [`${indent}---`];
  if (node.type === 'blockquote') {
    return (node.content ?? [])
      .flatMap((child) => blockLines(child, ''))
      .map((line) => `${indent}> ${line}`.trimEnd());
  }
  if (node.type === 'heading') {
    const text = inlineText(node.content).replaceAll('\n', ' ');
    return [`${'#'.repeat(node.attrs?.level ?? 2)} ${text}`];
  }
  if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') {
    const lines = [];
    (node.content ?? []).forEach((item, index) => {
      let marker = '- ';
      if (node.type === 'orderedList') marker = `${(node.attrs?.start ?? 1) + index}. `;
      if (node.type === 'taskList') marker = item.attrs?.checked ? '- [x] ' : '- [ ] ';
      const [first, ...rest] = item.content ?? [];
      const inner = indent + ' '.repeat(INDENT);
      const firstLines = first?.type === 'paragraph' ? blockLines(first, '') : [''];
      lines.push(`${indent}${marker}${firstLines[0]}`);
      lines.push(...firstLines.slice(1).map((line) => inner + line));
      if (first && first.type !== 'paragraph') lines.push(...blockLines(first, inner));
      for (const child of rest) lines.push(...blockLines(child, inner));
    });
    return lines;
  }
  // Anything unexpected (pasted from elsewhere): keep its text.
  return (node.content ?? []).flatMap((child) =>
    child.type === 'text' ? [indent + inlineText([child])] : blockLines(child, indent),
  );
}

/** Editor document -> stored text. */
export function docToNote(doc) {
  return (doc.content ?? []).flatMap((node) => blockLines(node)).join('\n');
}
