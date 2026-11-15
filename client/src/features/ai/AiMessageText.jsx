import { FileTypeIcon } from '../files/FileTypeIcon.jsx';

// A small Markdown subset for assistant answers, built into React elements
// (never HTML): paragraphs, lists, headings, > quotes, ``` code blocks, ---
// rules, | tables |, **bold**, *italic*, ~~strike~~, `code`, [links](https://…)
// and [[file:<id>]] citations, which become buttons that open the file.

const INLINE = new RegExp(
  [
    String.raw`(?<cite>\[\[file:(?<fileId>[a-f\d]{24})\]\])`,
    String.raw`(?<link>\[(?<linkText>[^\]\n]+)\]\((?<linkUrl>https?:\/\/[^\s)]+)\))`,
    String.raw`(?<bold>(?:\*\*(?<boldText>[^*\n]+?)\*\*)|(?:__(?<boldText2>[^_\n]+?)__))`,
    String.raw`(?<strike>~~(?<strikeText>[^~\n]+?)~~)`,
    String.raw`(?<code>\x60(?<codeText>[^\x60\n]+?)\x60)`,
    String.raw`(?<italic>(?<![\p{L}\p{M}\p{N}_*])[*_](?<italicText>[^\s*_][^*_\n]*?)[*_](?![\p{L}\p{M}\p{N}_*]))`,
  ].join('|'),
  'gu',
);

function Citation({ fileId, files, onOpenFile }) {
  const file = files.get(fileId);
  if (!file) {
    return <span className="text-muted">(file no longer available)</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpenFile(file)}
      title={`Open ${file.name}`}
      className="border-line bg-subtle hover:bg-line/60 mx-0.5 inline-flex max-w-full translate-y-[3px] items-center gap-1 rounded-full border px-2 py-0.5 align-baseline text-xs font-medium"
    >
      <FileTypeIcon category={file.category} className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Open</span>
    </button>
  );
}

function Inline({ text, files, onOpenFile }) {
  const parts = [];
  let last = 0;
  const props = { files, onOpenFile };
  for (const match of text.matchAll(INLINE)) {
    const { groups } = match;
    const key = match.index;
    parts.push(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (groups.cite) {
      parts.push(<Citation key={key} fileId={groups.fileId} {...props} />);
    } else if (groups.link) {
      parts.push(
        <a
          key={key}
          href={groups.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2"
        >
          <Inline text={groups.linkText} {...props} />
        </a>,
      );
    } else if (groups.bold) {
      parts.push(
        <strong key={key} className="font-semibold">
          <Inline text={groups.boldText ?? groups.boldText2} {...props} />
        </strong>,
      );
    } else if (groups.strike) {
      parts.push(
        <s key={key}>
          <Inline text={groups.strikeText} {...props} />
        </s>,
      );
    } else if (groups.code) {
      parts.push(
        <code key={key} className="bg-subtle rounded px-1 py-0.5 font-mono text-[0.85em]">
          {groups.codeText}
        </code>,
      );
    } else if (groups.italic) {
      parts.push(
        <em key={key}>
          <Inline text={groups.italicText} {...props} />
        </em>,
      );
    }
  }
  parts.push(text.slice(last));
  return parts;
}

const BULLET = /^\s*[-*+•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const tableCells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

function toBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', lines: paragraph });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // ``` code block: everything up to the closing fence (or the end, while
    // the answer is still streaming) is shown as is.
    const fence = line.match(FENCE);
    if (fence) {
      flush();
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'pre', text: code.join('\n') });
      continue;
    }

    // > quote: gather the run of quoted lines and parse them as their own
    // little document, so lists and bold inside a quote still work.
    if (QUOTE.test(line)) {
      flush();
      const inner = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(lines[i].match(QUOTE)[1]);
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'quote', blocks: toBlocks(inner.join('\n')) });
      continue;
    }

    if (TABLE_ROW.test(line) && TABLE_DIVIDER.test(lines[i + 1] ?? '')) {
      flush();
      const head = tableCells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(tableCells(lines[i]));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'table', head, rows });
      continue;
    }

    if (RULE.test(line)) {
      flush();
      blocks.push({ type: 'hr' });
      continue;
    }

    const heading = line.match(HEADING);
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);
    if (heading) {
      flush();
      blocks.push({ type: 'h', text: heading[1] });
    } else if (bullet || numbered) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const item = bullet ? bullet[1] : numbered[2];
      const previous = blocks.at(-1);
      if (previous?.type === type) previous.items.push(item);
      else blocks.push({ type, items: [item], start: numbered ? Number(numbered[1]) : 1 });
    } else if (!line.trim()) {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

function Blocks({ blocks, ...props }) {
  return blocks.map((block, index) => {
    if (block.type === 'h') {
      return (
        <p key={index} className="font-semibold">
          <Inline text={block.text} {...props} />
        </p>
      );
    }
    if (block.type === 'quote') {
      return (
        <div key={index} className="border-line space-y-2 border-l-2 pl-3">
          <Blocks blocks={block.blocks} {...props} />
        </div>
      );
    }
    if (block.type === 'pre') {
      return (
        <pre
          key={index}
          className="bg-subtle overflow-x-auto whitespace-pre-wrap rounded-lg px-3 py-2 font-mono text-[0.85em]"
        >
          {block.text}
        </pre>
      );
    }
    if (block.type === 'hr') {
      return <hr key={index} className="border-line" />;
    }
    if (block.type === 'table') {
      return (
        <div key={index} className="overflow-x-auto">
          <table className="border-line w-full border-collapse text-left text-[0.95em]">
            <thead>
              <tr>
                {block.head.map((cell, c) => (
                  <th key={c} className="border-line border-b px-2 py-1 font-semibold">
                    <Inline text={cell} {...props} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border-line border-b px-2 py-1 align-top">
                      <Inline text={cell} {...props} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (block.type === 'ul' || block.type === 'ol') {
      const List = block.type;
      return (
        <List
          key={index}
          start={block.type === 'ol' ? block.start : undefined}
          className={`space-y-1 pl-5 ${block.type === 'ul' ? 'list-disc' : 'list-decimal'}`}
        >
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <Inline text={item} {...props} />
            </li>
          ))}
        </List>
      );
    }
    return (
      <p key={index}>
        {block.lines.map((line, lineIndex) => (
          <span key={lineIndex}>
            {lineIndex > 0 && <br />}
            <Inline text={line} {...props} />
          </span>
        ))}
      </p>
    );
  });
}

// The answer as plain text for the clipboard: no Markdown marks, so a caption
// pasted into Instagram or WhatsApp doesn't come with > and ** in it.
export function toPlainText(text) {
  return text
    .replace(/\[\[file:[a-f\d]{24}\]\]/g, '')
    .split('\n')
    .filter((line) => !FENCE.test(line) && !TABLE_DIVIDER.test(line))
    .map((line) =>
      line
        .replace(/^(\s*>\s?)+/, '')
        .replace(HEADING, '$1')
        .replace(RULE, '')
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
        .replace(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, '$1$2')
        .replace(/~~([^~\n]+?)~~/g, '$1')
        .replace(/\x60([^\x60\n]+?)\x60/g, '$1')
        .replace(
          /(?<![\p{L}\p{M}\p{N}_*])[*_]([^\s*_][^*_\n]*?)[*_](?![\p{L}\p{M}\p{N}_*])/gu,
          '$1',
        )
        .replace(/ {2,}/g, ' ')
        .trimEnd(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function AiMessageText({ text, files, onOpenFile }) {
  return (
    <div className="space-y-2 break-words text-sm leading-6">
      <Blocks blocks={toBlocks(text)} files={files} onOpenFile={onOpenFile} />
    </div>
  );
}
