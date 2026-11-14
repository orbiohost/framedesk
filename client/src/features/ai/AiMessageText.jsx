import { FileTypeIcon } from '../files/FileTypeIcon.jsx';

// A small Markdown subset for assistant answers, built into React elements
// (never HTML): paragraphs, lists, headings, **bold**, *italic*, `code`, and
// [[file:<id>]] citations, which become buttons that open the file.

const INLINE = new RegExp(
  [
    String.raw`(?<cite>\[\[file:(?<fileId>[a-f\d]{24})\]\])`,
    String.raw`(?<bold>\*\*(?<boldText>[^*\n]+?)\*\*)`,
    String.raw`(?<code>\x60(?<codeText>[^\x60\n]+?)\x60)`,
    String.raw`(?<italic>(?<![\p{L}\p{N}_*])[*_](?<italicText>[^\s*_][^*_\n]*?)[*_](?![\p{L}\p{N}_*]))`,
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
  for (const match of text.matchAll(INLINE)) {
    const { groups } = match;
    const key = match.index;
    parts.push(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (groups.cite) {
      parts.push(
        <Citation key={key} fileId={groups.fileId} files={files} onOpenFile={onOpenFile} />,
      );
    } else if (groups.bold) {
      parts.push(
        <strong key={key} className="font-semibold">
          <Inline text={groups.boldText} files={files} onOpenFile={onOpenFile} />
        </strong>,
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
          <Inline text={groups.italicText} files={files} onOpenFile={onOpenFile} />
        </em>,
      );
    }
  }
  parts.push(text.slice(last));
  return parts;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,4}\s+(.*)$/;

function toBlocks(text) {
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', lines: paragraph });
    paragraph = [];
  };
  for (const line of text.split('\n')) {
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);
    const heading = line.match(HEADING);
    if (bullet || numbered) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const item = bullet ? bullet[1] : numbered[2];
      const previous = blocks.at(-1);
      if (previous?.type === type) previous.items.push(item);
      else blocks.push({ type, items: [item], start: numbered ? Number(numbered[1]) : 1 });
    } else if (heading) {
      flush();
      blocks.push({ type: 'h', text: heading[1] });
    } else if (!line.trim()) {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

export function AiMessageText({ text, files, onOpenFile }) {
  const props = { files, onOpenFile };
  return (
    <div className="space-y-2 break-words text-sm leading-6">
      {toBlocks(text).map((block, index) => {
        if (block.type === 'h') {
          return (
            <p key={index} className="font-semibold">
              <Inline text={block.text} {...props} />
            </p>
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
      })}
    </div>
  );
}
