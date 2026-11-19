import { useEditorState } from '@tiptap/react';
import {
  Baseline,
  Bold,
  Code,
  Highlighter,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Omega,
  Quote,
  Redo2,
  RemoveFormatting,
  SeparatorHorizontal,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn.js';
import { DictateButton } from '../transcripts/DictateButton.jsx';
import { applyStyle } from './noteMarks.js';
import { SYMBOL_GROUPS, TEXT_COLORS, TEXT_SIZES } from './noteStyles.js';

// Buttons keep the editor's selection: the mouse-down never takes focus.
const keepSelection = (event) => event.preventDefault();

function ToolButton({ label, icon: Icon, active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={keepSelection}
      onClick={onClick}
      className={cn(
        'grid h-7 min-w-7 place-items-center rounded-md px-1 transition-colors disabled:opacity-40',
        active ? 'bg-ink/10 text-ink' : 'text-muted enabled:hover:bg-subtle enabled:hover:text-ink',
      )}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : children}
    </button>
  );
}

const Divider = () => <span className="bg-line mx-0.5 h-4 w-px shrink-0" aria-hidden="true" />;

function Chip({ active, onClick, title, className, children }) {
  return (
    <button
      type="button"
      onMouseDown={keepSelection}
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'h-7 shrink-0 rounded-md border px-2 transition-colors',
        active
          ? 'border-ink/30 bg-ink/5 text-ink'
          : 'text-ink/80 hover:bg-subtle border-transparent',
        className,
      )}
    >
      {children}
    </button>
  );
}

const SIZE_PREVIEW = { sm: 'text-[11px]', lg: 'text-[15px]', xl: 'text-[17px] font-medium' };

function TextPanel({ editor, state }) {
  const run = (fn) => fn(editor.chain().focus()).run();
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {TEXT_SIZES.map((size) => (
        <Chip
          key={size.label}
          active={state.size === size.key}
          title={`${size.label} text`}
          className={SIZE_PREVIEW[size.key]}
          onClick={() => applyStyle(editor, 'textSize', 'size', size.key)}
        >
          {size.label}
        </Chip>
      ))}
      <Divider />
      <Chip
        active={!state.heading}
        title="Body text"
        onClick={() => run((chain) => chain.setParagraph())}
      >
        Body
      </Chip>
      {[1, 2, 3].map((level) => (
        <Chip
          key={level}
          active={state.heading === level}
          title={`Heading ${level}`}
          className="font-semibold"
          onClick={() => run((chain) => chain.toggleHeading({ level }))}
        >
          H{level}
        </Chip>
      ))}
    </div>
  );
}

function ColorPanel({ editor, state }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <Chip
        active={!state.color}
        title="Default colour"
        onClick={() => applyStyle(editor, 'textColor', 'color', null)}
        className="font-semibold"
      >
        A
      </Chip>
      {TEXT_COLORS.map((color) => (
        <Chip
          key={color.key}
          active={state.color === color.key}
          title={color.label}
          className={cn('font-semibold', `note-c-${color.key}`)}
          onClick={() => applyStyle(editor, 'textColor', 'color', color.key)}
        >
          A
        </Chip>
      ))}
      <Divider />
      <ToolButton
        label="Highlight (Ctrl + Shift + H)"
        icon={Highlighter}
        active={state.highlight}
        onClick={() => editor.chain().focus().toggleMark('highlight').run()}
      />
      <ToolButton
        label="Clear formatting"
        icon={RemoveFormatting}
        onClick={() => editor.chain().focus().unsetAllMarks().run()}
      />
    </div>
  );
}

function SymbolPanel({ editor }) {
  return (
    <div className="scrollbar-thin max-h-40 space-y-1.5 overflow-y-auto">
      {SYMBOL_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-muted mb-0.5 text-[10px] font-medium uppercase tracking-wide">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-0.5">
            {group.symbols.map((symbol) => (
              <button
                key={symbol}
                type="button"
                title={`Insert ${symbol}`}
                aria-label={`Insert ${symbol}`}
                onMouseDown={keepSelection}
                onClick={() => editor.chain().focus().insertContent(symbol).run()}
                className="hover:bg-subtle grid h-7 w-7 place-items-center rounded-md text-sm"
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The note editor's formatting bar.
 * variant "full": everything; "compact": the essentials, for sticky notes.
 * Sizes, colours and symbols open as a row under the bar (never a floating
 * menu, so they're not clipped inside a small sticky note).
 */
export function NoteToolbar({ editor, variant = 'full', workspaceId, onDictationError, onSpoken }) {
  const [panel, setPanel] = useState(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      const heading = [1, 2, 3].find((level) => current.isActive('heading', { level })) ?? null;
      return {
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        code: current.isActive('code'),
        highlight: current.isActive('highlight'),
        bullet: current.isActive('bulletList'),
        numbered: current.isActive('orderedList'),
        check: current.isActive('taskList'),
        quote: current.isActive('blockquote'),
        heading,
        color: current.getAttributes('textColor').color ?? null,
        size: current.getAttributes('textSize').size ?? null,
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });
  if (!editor || !state) return null;

  const run = (fn) => fn(editor.chain().focus()).run();
  const toggle = (name) => setPanel((current) => (current === name ? null : name));
  const compact = variant === 'compact';

  const colorButton = (
    <ToolButton
      label="Text colour and highlight"
      active={panel === 'color'}
      onClick={() => toggle('color')}
    >
      <span className="relative grid place-items-center">
        <Baseline className="h-4 w-4" aria-hidden="true" />
        <span
          className={cn(
            'absolute -bottom-0.5 h-[3px] w-3.5 rounded-full',
            state.color ? `note-bg-${state.color}` : state.highlight ? 'note-hl' : 'bg-transparent',
          )}
          aria-hidden="true"
        />
      </span>
    </ToolButton>
  );

  return (
    <div className={cn('border-line/60', panel && 'border-b pb-1.5')}>
      <div
        role="toolbar"
        aria-label="Formatting"
        className={cn('flex flex-wrap items-center gap-0.5', compact ? 'px-2 py-1' : 'px-2.5 pb-1')}
      >
        <ToolButton
          label="Text size and headings"
          icon={Type}
          active={panel === 'text' || Boolean(state.size) || Boolean(state.heading)}
          onClick={() => toggle('text')}
        />
        {colorButton}
        <Divider />
        <ToolButton
          label="Bold (Ctrl + B)"
          icon={Bold}
          active={state.bold}
          onClick={() => run((chain) => chain.toggleBold())}
        />
        <ToolButton
          label="Italic (Ctrl + I)"
          icon={Italic}
          active={state.italic}
          onClick={() => run((chain) => chain.toggleItalic())}
        />
        <ToolButton
          label="Underline (Ctrl + U)"
          icon={Underline}
          active={state.underline}
          onClick={() => run((chain) => chain.toggleUnderline())}
        />
        {!compact && (
          <ToolButton
            label="Strikethrough (Ctrl + Shift + S)"
            icon={Strikethrough}
            active={state.strike}
            onClick={() => run((chain) => chain.toggleStrike())}
          />
        )}
        <Divider />
        <ToolButton
          label="To-do list"
          icon={ListChecks}
          active={state.check}
          onClick={() => run((chain) => chain.toggleTaskList())}
        />
        <ToolButton
          label="Bulleted list"
          icon={List}
          active={state.bullet}
          onClick={() => run((chain) => chain.toggleBulletList())}
        />
        {!compact && (
          <>
            <ToolButton
              label="Numbered list"
              icon={ListOrdered}
              active={state.numbered}
              onClick={() => run((chain) => chain.toggleOrderedList())}
            />
            <Divider />
            <ToolButton
              label="Quote"
              icon={Quote}
              active={state.quote}
              onClick={() => run((chain) => chain.toggleBlockquote())}
            />
            <ToolButton
              label="Divider line"
              icon={SeparatorHorizontal}
              onClick={() => run((chain) => chain.setHorizontalRule())}
            />
            <ToolButton
              label="Code"
              icon={Code}
              active={state.code}
              onClick={() => run((chain) => chain.toggleCode())}
            />
          </>
        )}
        <ToolButton
          label="Special characters"
          icon={Omega}
          active={panel === 'symbols'}
          onClick={() => toggle('symbols')}
        />
        {!compact && (
          <>
            <Divider />
            <ToolButton
              label="Undo (Ctrl + Z)"
              icon={Undo2}
              disabled={!state.canUndo}
              onClick={() => run((chain) => chain.undo())}
            />
            <ToolButton
              label="Redo (Ctrl + Shift + Z)"
              icon={Redo2}
              disabled={!state.canRedo}
              onClick={() => run((chain) => chain.redo())}
            />
          </>
        )}
        {workspaceId && !compact && (
          <DictateButton
            workspaceId={workspaceId}
            variant="icon"
            label="Speak to type"
            onError={onDictationError}
            onText={onSpoken}
            className="ml-auto h-7 min-w-7 rounded-md"
          />
        )}
      </div>
      {panel && (
        <div className={cn(compact ? 'px-2' : 'px-3')}>
          {panel === 'text' && <TextPanel editor={editor} state={state} />}
          {panel === 'color' && <ColorPanel editor={editor} state={state} />}
          {panel === 'symbols' && <SymbolPanel editor={editor} />}
        </div>
      )}
    </div>
  );
}
