import { Bold, Heading2, Italic, List, ListChecks, ListOrdered, Strikethrough } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { cn } from '../../lib/cn.js';
import { insertSpokenText } from '../../lib/insertText.js';
import { DictateButton } from '../transcripts/DictateButton.jsx';
import { continueList, toggleLinePrefix, wrapSelection } from './noteFormat.js';

const TOOLS = [
  {
    key: 'check',
    label: 'To-do list',
    icon: ListChecks,
    run: (v, s, e) => toggleLinePrefix(v, s, e, 'check'),
  },
  {
    key: 'bullet',
    label: 'Bulleted list',
    icon: List,
    run: (v, s, e) => toggleLinePrefix(v, s, e, 'bullet'),
  },
  {
    key: 'numbered',
    label: 'Numbered list',
    icon: ListOrdered,
    run: (v, s, e) => toggleLinePrefix(v, s, e, 'numbered'),
  },
  {
    key: 'heading',
    label: 'Heading',
    icon: Heading2,
    run: (v, s, e) => toggleLinePrefix(v, s, e, 'heading'),
    divider: true,
  },
  {
    key: 'bold',
    label: 'Bold (Ctrl + B)',
    icon: Bold,
    run: (v, s, e) => wrapSelection(v, s, e, '**', 'bold'),
  },
  {
    key: 'italic',
    label: 'Italic (Ctrl + I)',
    icon: Italic,
    run: (v, s, e) => wrapSelection(v, s, e, '_', 'italic'),
  },
  {
    key: 'strike',
    label: 'Strikethrough',
    icon: Strikethrough,
    run: (v, s, e) => wrapSelection(v, s, e, '~~', 'text'),
  },
];

const SHORTCUTS = { b: 'bold', i: 'italic' };

/**
 * A plain textarea with a formatting toolbar. Formatting is written as light
 * Markdown (see noteFormat.js); Enter keeps lists and to-dos going.
 * workspaceId: adds a mic button to the toolbar that types what you say.
 * onDictationError(message | null): where mic problems are reported.
 */
export function NoteTextEditor({
  value,
  onChange,
  onKeyDown,
  onFocus,
  showToolbar = true,
  workspaceId,
  onDictationError,
  className,
  ...textareaProps
}) {
  const ref = useRef(null);
  const pendingSelection = useRef(null);

  // Put the cursor back where the edit left it, once React has rendered the new text.
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    if (!selection || !ref.current) return;
    pendingSelection.current = null;
    ref.current.setSelectionRange(selection.start, selection.end);
  });

  function apply(result) {
    if (!result) return false;
    pendingSelection.current = { start: result.start, end: result.end };
    onChange(result.value);
    return true;
  }

  function runTool(tool) {
    const element = ref.current;
    element.focus();
    apply(tool.run(value, element.selectionStart, element.selectionEnd));
  }

  function handleKeyDown(event) {
    const element = event.currentTarget;
    const shortcut = SHORTCUTS[event.key.toLowerCase()];
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && shortcut) {
      event.preventDefault();
      runTool(TOOLS.find((tool) => tool.key === shortcut));
      return;
    }
    const plainEnter =
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.nativeEvent.isComposing;
    if (plainEnter && apply(continueList(value, element.selectionStart, element.selectionEnd))) {
      event.preventDefault();
      return;
    }
    onKeyDown?.(event);
  }

  return (
    <div>
      {showToolbar && (
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex flex-wrap items-center gap-0.5 px-2.5 pb-1"
        >
          {TOOLS.map((tool) => (
            <span key={tool.key} className="flex items-center">
              <button
                type="button"
                title={tool.label}
                aria-label={tool.label}
                // Keeps the textarea's selection while clicking.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runTool(tool)}
                className="text-muted hover:bg-subtle hover:text-ink grid h-7 w-7 place-items-center rounded-lg"
              >
                <tool.icon className="h-4 w-4" aria-hidden="true" />
              </button>
              {tool.divider && <span className="bg-line mx-1 h-4 w-px" aria-hidden="true" />}
            </span>
          ))}
          {workspaceId && (
            <DictateButton
              workspaceId={workspaceId}
              variant="icon"
              label="Speak to type"
              onError={onDictationError}
              onText={(text) => insertSpokenText(ref.current, text)}
              className="ml-auto h-7 min-w-7 rounded-lg"
            />
          )}
        </div>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        className={cn(
          'placeholder:text-muted/70 block w-full resize-none bg-transparent px-4 text-sm leading-relaxed outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
          className,
        )}
        {...textareaProps}
      />
    </div>
  );
}
