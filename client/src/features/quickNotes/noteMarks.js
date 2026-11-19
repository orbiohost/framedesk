import { Mark, mergeAttributes } from '@tiptap/react';
import { styleClassNames } from './noteStyles.js';

// Editor marks for the note styles that aren't in StarterKit. Each one maps to
// the light Markdown in noteDoc.js, so what's stored stays plain text.

function styleMark(name, attr) {
  return Mark.create({
    name,
    addAttributes() {
      return {
        [attr]: {
          default: null,
          parseHTML: (element) => element.getAttribute(`data-${attr}`),
          renderHTML: (attributes) =>
            attributes[attr]
              ? {
                  [`data-${attr}`]: attributes[attr],
                  class: styleClassNames({ [attr]: attributes[attr] }),
                }
              : {},
        },
      };
    },
    parseHTML() {
      return [{ tag: `span[data-${attr}]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['span', mergeAttributes(HTMLAttributes), 0];
    },
  });
}

// [words]{.red}
export const TextColor = styleMark('textColor', 'color');
// [words]{.lg}
export const TextSize = styleMark('textSize', 'size');

// ==words==
export const Highlight = Mark.create({
  name: 'highlight',
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes, { class: 'note-hl' }), 0];
  },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-h': () => this.editor.commands.toggleMark(this.name) };
  },
});

// Sets (or clears, with null) a colour or size on the selection.
export function applyStyle(editor, type, attr, value) {
  const chain = editor.chain().focus();
  if (value) chain.setMark(type, { [attr]: value });
  else chain.unsetMark(type);
  chain.run();
}
