import { Placeholder } from '@tiptap/extension-placeholder';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { Spellcheck } from '../spellcheck/spellcheckExtension.js';
import { SpellMenu } from '../spellcheck/SpellMenu.jsx';
import { docToNote, noteToDoc } from './noteDoc.js';
import { Highlight, TextColor, TextSize } from './noteMarks.js';
import { NoteToolbar } from './NoteToolbar.jsx';

const EXTENSIONS_OFF = {
  codeBlock: false,
  // Links stay as typed text; cards turn URLs into links when showing the note.
  link: false,
};

/**
 * The note editor: you see headings, lists and ticked to-dos as you write,
 * instead of Markdown symbols. `value` / `onChange` are still the note's plain
 * text (see noteDoc.js), so nothing about how notes are stored changes.
 *
 * Typing shortcuts work too: "- " list, "1. " numbered, "[ ] " to-do,
 * "## " heading, "> " quote, "---" divider, **bold**, _italic_; Tab indents a
 * list item. The toolbar adds underline, highlight, text colour and size, and
 * special characters.
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
  // 'full' (default) or 'compact' (sticky notes); showToolbar false hides it.
  toolbar = 'full',
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
      TextColor,
      TextSize,
      Highlight,
      Spellcheck,
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
          // The app's own checker underlines words (no double lines).
          spellcheck: 'false',
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

  // Suggestions for a clicked misspelled word.
  const [spellMenu, setSpellMenu] = useState(null);
  const closeSpellMenu = useCallback(() => setSpellMenu(null), []);
  useEffect(() => {
    if (!editor) return undefined;
    editor.on('spellcheckMenu', setSpellMenu);
    return () => editor.off('spellcheckMenu', setSpellMenu);
  }, [editor]);

  function fixSpelling(replacement) {
    if (!editor || !spellMenu) return;
    const { from, to } = spellMenu;
    editor.view.dispatch(editor.state.tr.insertText(replacement, from, to));
    editor.commands.focus();
  }

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
        <NoteToolbar
          editor={editor}
          variant={toolbar}
          workspaceId={workspaceId}
          onDictationError={onDictationError}
          onSpoken={insertSpoken}
        />
      )}
      <EditorContent
        editor={editor}
        className={cn('px-4', className)}
        // Clicking the empty space under the text puts the cursor at the end.
        onClick={(event) => {
          if (event.target === event.currentTarget) editor?.chain().focus('end').run();
        }}
      />
      <SpellMenu menu={spellMenu} onPick={fixSpelling} onClose={closeSpellMenu} />
    </div>
  );
}
