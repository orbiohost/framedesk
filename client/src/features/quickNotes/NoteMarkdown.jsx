import { Check } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { parseLine } from './noteFormat.js';
import { parseStyleClasses, styleClassNames } from './noteStyles.js';

// Inline marks, in priority order. Built into React elements, never HTML,
// so a note can't inject markup.
const INLINE = new RegExp(
  [
    String.raw`(?<style>\[(?<styleText>[^\]\n]+)\]\{(?<styleCls>\.[a-z]+(?: \.[a-z]+)*)\})`,
    String.raw`(?<bold>\*\*(?<boldText>[^*\n]+?)\*\*)`,
    String.raw`(?<under>\+\+(?<underText>[^+\n]+?)\+\+)`,
    String.raw`(?<hl>==(?<hlText>[^=\n]+?)==)`,
    String.raw`(?<strike>~~(?<strikeText>[^~\n]+?)~~)`,
    String.raw`(?<code>\x60(?<codeText>[^\x60\n]+?)\x60)`,
    String.raw`(?<italic>(?<![\p{L}\p{N}_*])[_*](?<italicText>[^\s_*][^_*\n]*?)[_*](?![\p{L}\p{N}_*]))`,
    String.raw`(?<url>https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])`,
    String.raw`(?<tag>(?<![\p{L}\p{N}_&/#])#(?<tagText>[\p{L}\p{N}_-]{1,40}))`,
  ].join('|'),
  'gu',
);

function Inline({ text, onTagClick }) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const groups = match.groups;
    const key = match.index;
    parts.push(text.slice(last, match.index));
    last = match.index + match[0].length;

    if (groups.style) {
      parts.push(
        <span key={key} className={styleClassNames(parseStyleClasses(groups.styleCls))}>
          <Inline text={groups.styleText} onTagClick={onTagClick} />
        </span>,
      );
    } else if (groups.under) {
      parts.push(
        <u key={key} className="underline-offset-2">
          <Inline text={groups.underText} onTagClick={onTagClick} />
        </u>,
      );
    } else if (groups.hl) {
      parts.push(
        <mark key={key} className="note-hl">
          <Inline text={groups.hlText} onTagClick={onTagClick} />
        </mark>,
      );
    } else if (groups.bold) {
      parts.push(
        <strong key={key} className="font-semibold">
          <Inline text={groups.boldText} onTagClick={onTagClick} />
        </strong>,
      );
    } else if (groups.strike) {
      parts.push(
        <s key={key} className="opacity-70">
          <Inline text={groups.strikeText} onTagClick={onTagClick} />
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
          <Inline text={groups.italicText} onTagClick={onTagClick} />
        </em>,
      );
    } else if (groups.url) {
      parts.push(
        <a
          key={key}
          href={groups.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent dark:text-ink break-all underline underline-offset-2"
          onClick={(event) => event.stopPropagation()}
        >
          {groups.url}
        </a>,
      );
    } else if (groups.tag) {
      const tag = groups.tagText.toLowerCase();
      parts.push(
        onTagClick ? (
          <button
            key={key}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTagClick(tag);
            }}
            className="text-accent dark:text-ink font-medium hover:underline"
          >
            #{groups.tagText}
          </button>
        ) : (
          <span key={key} className="text-accent dark:text-ink font-medium">
            #{groups.tagText}
          </span>
        ),
      );
    }
  }
  parts.push(text.slice(last));
  return parts;
}

function CheckItem({ item, onToggle, onTagClick }) {
  const box = (
    <span
      className={cn(
        'mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-colors',
        item.checked ? 'border-accent bg-accent text-accent-ink' : 'border-ink/30 bg-surface',
      )}
    >
      {item.checked && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
    </span>
  );
  const label = (
    <span className={cn('min-w-0 flex-1', item.checked && 'text-muted line-through')}>
      <Inline text={item.text} onTagClick={onTagClick} />
    </span>
  );
  return (
    <li style={{ paddingLeft: `${item.indent * 0.6}rem` }}>
      {onToggle ? (
        <div className="flex items-start gap-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={item.checked}
            aria-label={
              item.checked ? `Mark "${item.text}" as not done` : `Mark "${item.text}" done`
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggle(item.line);
            }}
            className="hover:ring-accent/30 rounded-[5px] hover:ring-2"
          >
            {box}
          </button>
          {label}
        </div>
      ) : (
        <div className="flex items-start gap-2">
          {box}
          {label}
        </div>
      )}
    </li>
  );
}

// Consecutive list lines of the same kind become one list.
function toBlocks(text) {
  const blocks = [];
  text.split('\n').forEach((line, index) => {
    const parsed = { ...parseLine(line), line: index };
    const previous = blocks[blocks.length - 1];
    const isList = ['check', 'bullet', 'numbered', 'quote'].includes(parsed.type);
    if (isList && previous?.type === parsed.type) previous.items.push(parsed);
    else if (isList) blocks.push({ type: parsed.type, items: [parsed], line: index });
    else blocks.push(parsed);
  });
  // Trailing blank lines add nothing.
  while (blocks.length && blocks[blocks.length - 1].type === 'blank') blocks.pop();
  return blocks;
}

const HEADING_SIZES = { 1: 'text-base', 2: 'text-[15px]', 3: 'text-sm' };

/**
 * Renders a note's text. onToggle(lineIndex) makes to-dos tickable;
 * onTagClick(tag) makes #tags into filters.
 */
export function NoteMarkdown({ text, onToggle, onTagClick, className }) {
  return (
    <div className={cn('space-y-1 break-words text-sm leading-relaxed', className)}>
      {toBlocks(text).map((block) => {
        const key = block.line;
        if (block.type === 'blank') return <div key={key} className="h-1.5" aria-hidden="true" />;
        if (block.type === 'heading') {
          return (
            <p key={key} className={cn('pt-1 font-semibold', HEADING_SIZES[block.level])}>
              <Inline text={block.text} onTagClick={onTagClick} />
            </p>
          );
        }
        if (block.type === 'divider') {
          return <hr key={key} className="border-line my-2" />;
        }
        if (block.type === 'quote') {
          return (
            <blockquote key={key} className="border-ink/20 text-ink/80 border-l-2 pl-3">
              {block.items.map((item) => (
                <p key={item.line} className="min-h-[1em] whitespace-pre-wrap">
                  <Inline text={item.text} onTagClick={onTagClick} />
                </p>
              ))}
            </blockquote>
          );
        }
        if (block.type === 'check') {
          return (
            <ul key={key} className="space-y-1">
              {block.items.map((item) => (
                <CheckItem
                  key={item.line}
                  item={item}
                  onToggle={onToggle}
                  onTagClick={onTagClick}
                />
              ))}
            </ul>
          );
        }
        if (block.type === 'bullet' || block.type === 'numbered') {
          const List = block.type === 'bullet' ? 'ul' : 'ol';
          return (
            <List
              key={key}
              start={block.type === 'numbered' ? block.items[0].number : undefined}
              className={cn(
                'marker:text-muted space-y-0.5 pl-5',
                block.type === 'bullet' ? 'list-disc' : 'list-decimal',
              )}
            >
              {block.items.map((item) => (
                <li key={item.line} style={{ marginLeft: `${item.indent * 0.6}rem` }}>
                  <Inline text={item.text} onTagClick={onTagClick} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={key} className="whitespace-pre-wrap">
            <Inline text={block.text} onTagClick={onTagClick} />
          </p>
        );
      })}
    </div>
  );
}
