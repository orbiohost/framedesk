import { Placeholder } from '@tiptap/extension-placeholder';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import {
  Bold,
  Code,
  Heading2,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn.js';
import { DictateButton } from '../transcripts/DictateButton.jsx';
import { docToNote, noteToDoc } from './noteDoc.js';

const TOOLS = [
  {
    key: 'check',
    label: 'To-do list',
    icon: ListChecks,
    isActive: (editor) => editor.isActive('taskList'),
    run: (chain) => chain.toggleTaskList(),
  },
  {
    key: 'bullet',
    label: 'Bulleted list',
    icon: List,
    isActive: (editor) => editor.isActive('bulletList'),
    run: (chain) => chain.toggleBulletList(),
  },
  {
    key: 'numbered',
    label: 'Numbered list',
    icon: ListOrdered,
    isActive: (editor) => editor.isActive('orderedList'),
    run: (chain) => chain.toggleOrderedList(),
  },
  {
    key: 'heading',
    label: 'Heading',
    icon: Heading2,
    isActive: (editor) => editor.isActive('heading'),
    run: (chain) => chain.toggleHeading({ level: 2 }),
    divider: true,
  },
  {
    key: 'bold',
    label: 'Bold (Ctrl + B)',
    icon: Bold,
    isActive: (editor) => editor.isActive('bold'),
    run: (chain) => chain.toggleBold(),
  },
  {
    key: 'italic',
    label: 'Italic (Ctrl + I)',
    icon: Italic,
    isActive: (editor) => editor.isActive('italic'),
    run: (chain) => chain.toggleItalic(),
  },
  {
    key: 'strike',
    label: 'Strikethrough',
    icon: Strikethrough,
    isActive: (editor) => editor.isActive('strike'),
    run: (chain) => chain.toggleStrike(),
  },
  {
    key: 'code',
    label: 'Code',
    icon: Code,
    isActive: (editor) => editor.isActive('code'),
    run: (chain) => chain.toggleCode(),
  },
];

const EXTENSIONS_OFF = {
  blockquote: false,
  codeBlock: false,
  horizontalRule: false,
  // Links stay as typed text; cards turn URLs into links when showing the note.
  link: false,
  underline: false,
};

function ToolButton({ label, icon: Icon, active, disabled, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keeps the editor's selection while clicking.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-lg transition-colors disabled:opacity-40',
        active
          ? 'bg-accent/15 text-accent'
          : 'text-muted enabled:hover:bg-subtle enabled:hover:text-ink',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/**
 * The note editor: you see headings, lists and ticked to-dos as you write,
 * instead of Markdown symbols. `value` / `onChange` are still the note's plain
 * text (see noteDoc.js), so nothing about how notes are stored changes.
 *
 * Typing shortcuts work too: "- " list, "1. " numbered, "[ ] " to-do,
 * "## " heading, **bold**, _italic_; Tab indents a list item.
 *
 * onSubmit: Ctrl/Cmd + Enter. onEscape: Escape (leave unset to let it bubble).
 * workspaceId: adds a mic button to the toolbar that types what you say.
 * onDictationError(message | null): where mic problems are reported.
 */
export function NoteTextEditor({
  value,
  onChange,
  onSubmit,
  onEscape,
  onFocus,
  showToolbar = true,
  workspaceId,
  onDictationError,
  autoFocus = false,
  placeholder,
  className,
  'aria-label': ariaLabel,
}) {
  // What the editor last told us the text was, to tell our own edits from outside ones.
  const lastText = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ ...EXTENSIONS_OFF, heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: noteToDoc(value),
    autofocus: autoFocus ? 'end' : false,
  });

  // The editor is created once. Its callbacks are re-attached after each render,
  // so they always see the latest props.
  useEffect(() => {
    if (!editor) return undefined;
    const handleUpdate = () => {
      const text = docToNote(editor.getJSON());
      lastText.current = text;
      onChange(text);
    };
    const handleFocus = () => onFocus?.();
    editor.on('update', handleUpdate);
    editor.on('focus', handleFocus);
    editor.setOptions({
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': ariaLabel ?? 'Note',
        },
        handleKeyDown(view, event) {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            // Also stops a surrounding dialog from submitting a second time.
            event.preventDefault();
            onSubmit?.();
            return true;
          }
          if (event.key === 'Escape' && onEscape) {
            event.preventDefault();
            onEscape();
            view.dom.blur();
            return true;
          }
          return false;
        },
        // Plain text pasted in (from a doc, a chat, another note) keeps its lists and headings.
        handlePaste(_view, event) {
          const text = event.clipboardData?.getData('text/plain');
          if (!text || event.clipboardData.getData('text/html')) return false;
          const { content } = noteToDoc(text.replace(/\r\n?/g, '\n'));
          const single = content.length === 1 && content[0].type === 'paragraph';
          editor
            .chain()
            .focus()
            .insertContent(single ? (content[0].content ?? []) : content)
            .run();
          return true;
        },
      },
    });
    return () => {
      editor.off('update', handleUpdate);
      editor.off('focus', handleFocus);
    };
  });

  // The hint changes when the capture box opens up.
  useEffect(() => {
    if (!editor) return;
    const extension = editor.extensionManager.extensions.find(
      (candidate) => candidate.name === 'placeholder',
    );
    if (!extension || extension.options.placeholder === (placeholder ?? '')) return;
    extension.options.placeholder = placeholder ?? '';
    editor.view.dispatch(editor.state.tr);
  }, [editor, placeholder]);

  // The text was changed from outside (the form was reset after saving).
  useEffect(() => {
    if (!editor || value === lastText.current) return;
    lastText.current = value;
    editor.commands.setContent(noteToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      const active = {};
      for (const tool of TOOLS) active[tool.key] = tool.isActive(current);
      return { active, canUndo: current.can().undo(), canRedo: current.can().redo() };
    },
  });

  function insertSpoken(text) {
    if (!editor) return;
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(Math.max(0, from - 1), from, '\n');
    const spaced = before && !/\s/.test(before) ? ` ${text.trim()}` : text.trim();
    editor.chain().focus().insertContent(spaced).run();
  }

  return (
    <div className="note-editor">
      {showToolbar && (
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex flex-wrap items-center gap-0.5 px-2.5 pb-1"
        >
          {TOOLS.map((tool) => (
            <span key={tool.key} className="flex items-center">
              <ToolButton
                label={tool.label}
                icon={tool.icon}
                active={Boolean(state?.active[tool.key])}
                onClick={() => tool.run(editor.chain().focus()).run()}
              />
              {tool.divider && <span className="bg-line mx-1 h-4 w-px" aria-hidden="true" />}
            </span>
          ))}
          <span className="bg-line mx-1 h-4 w-px" aria-hidden="true" />
          <ToolButton
            label="Undo (Ctrl + Z)"
            icon={Undo2}
            disabled={!state?.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolButton
            label="Redo (Ctrl + Shift + Z)"
            icon={Redo2}
            disabled={!state?.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
          />
          {workspaceId && (
            <DictateButton
              workspaceId={workspaceId}
              variant="icon"
              label="Speak to type"
              onError={onDictationError}
              onText={insertSpoken}
              className="ml-auto h-7 min-w-7 rounded-lg"
            />
          )}
        </div>
      )}
      <EditorContent
        editor={editor}
        className={cn('px-4', className)}
        // Clicking the empty space under the text puts the cursor at the end.
        onClick={(event) => {
          if (event.target === event.currentTarget) editor?.chain().focus('end').run();
        }}
      />
    </div>
  );
}
