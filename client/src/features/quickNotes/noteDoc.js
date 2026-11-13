import { parseLine } from './noteFormat.js';

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
const MARKS = [
  ['bold', '**'],
  ['strike', '~~'],
  ['italic', '_'],
  ['code', '`'],
];
const MARKER = Object.fromEntries(MARKS);

const INLINE = new RegExp(
  [
    String.raw`(?<bold>\*\*(?<boldText>[^*\n]+?)\*\*)`,
    String.raw`(?<strike>~~(?<strikeText>[^~\n]+?)~~)`,
    String.raw`(?<code>\x60(?<codeText>[^\x60\n]+?)\x60)`,
    String.raw`(?<italic>(?<![\p{L}\p{N}_*])[_*](?<italicText>[^\s_*][^_*\n]*?)[_*](?![\p{L}\p{N}_*]))`,
  ].join('|'),
  'gu',
);

function textNode(text, marks) {
  if (marks.length === 0) return { type: 'text', text };
  return { type: 'text', text, marks: [...new Set(marks)].map((type) => ({ type })) };
}

function inlineNodes(text, marks = []) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const { groups } = match;
    if (match.index > last) nodes.push(textNode(text.slice(last, match.index), marks));
    last = match.index + match[0].length;
    if (groups.bold) nodes.push(...inlineNodes(groups.boldText, [...marks, 'bold']));
    else if (groups.strike) nodes.push(...inlineNodes(groups.strikeText, [...marks, 'strike']));
    else if (groups.italic) nodes.push(...inlineNodes(groups.italicText, [...marks, 'italic']));
    else nodes.push(textNode(groups.codeText, [...marks, 'code']));
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
  const flush = () => {
    if (run.length > 0) content.push(...listBlocks(run));
    run = [];
  };
  for (const line of String(text ?? '').split('\n')) {
    const parsed = parseLine(line);
    if (parsed.type in LIST_NODES) {
      run.push(parsed);
      continue;
    }
    flush();
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
  return { type: 'doc', content };
}

// Inline content -> text. Marks are opened and closed as a stack, and spaces at
// the edge of a marked run are kept outside the markers ("**bold** next").
function inlineText(content = []) {
  let out = '';
  let open = [];
  let pending = ''; // trailing spaces not yet written

  const closeTo = (keep) => {
    for (let i = open.length - 1; i >= keep; i -= 1) out += MARKER[open[i]];
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
    const want = MARKS.map(([type]) => type).filter((type) =>
      node.marks?.some((mark) => mark.type === type),
    );
    let keep = 0;
    while (keep < open.length && keep < want.length && open[keep] === want[keep]) keep += 1;
    closeTo(keep);
    out += pending + text.slice(0, text.indexOf(core));
    for (const type of want.slice(keep)) out += MARKER[type];
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
