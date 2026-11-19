import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { loadSpellchecker, misspelledRanges, onSpellcheckerChange } from '../../lib/spellcheck.js';

export const spellcheckKey = new PluginKey('spellcheck');

// Red wavy underlines under misspelled words in the note editor. The word
// being typed is checked once the caret leaves it. Clicking an underlined word
// emits editor event "spellcheckMenu" with { from, to, word, rect }.
function build(doc, typingAt) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (!node.isText || node.marks.some((mark) => mark.type.name === 'code')) return;
    const skipAt = typingAt !== null && typingAt >= pos ? typingAt - pos : -1;
    for (const range of misspelledRanges(node.text, { skipAt })) {
      decorations.push(
        Decoration.inline(pos + range.start, pos + range.end, {
          class: 'spell-error',
          'data-word': range.word,
        }),
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

export const Spellcheck = Extension.create({
  name: 'spellcheck',

  addStorage() {
    return { unsubscribe: null };
  },

  onCreate() {
    const refresh = () => {
      if (this.editor.isDestroyed) return;
      this.editor.view.dispatch(this.editor.state.tr.setMeta(spellcheckKey, 'refresh'));
    };
    this.storage.unsubscribe = onSpellcheckerChange(refresh);
    loadSpellchecker().catch(() => {});
  },

  onDestroy() {
    this.storage.unsubscribe?.();
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        key: spellcheckKey,
        state: {
          init: (_config, state) => ({ typingAt: null, set: build(state.doc, null) }),
          apply(tr, previous, _old, state) {
            if (tr.docChanged) {
              const typingAt = state.selection.empty ? state.selection.head : null;
              return { typingAt, set: build(state.doc, typingAt) };
            }
            if (tr.getMeta(spellcheckKey) === 'refresh') {
              return { typingAt: previous.typingAt, set: build(state.doc, previous.typingAt) };
            }
            // The caret moved away from the word being typed: check it now.
            if (tr.selectionSet && previous.typingAt !== null) {
              return { typingAt: null, set: build(state.doc, null) };
            }
            return previous;
          },
        },
        props: {
          decorations(state) {
            return spellcheckKey.getState(state).set;
          },
          handleClick(view, pos, event) {
            const target = event.target instanceof Element && event.target.closest('.spell-error');
            if (!target) return false;
            const [found] = spellcheckKey.getState(view.state).set.find(pos, pos);
            if (!found) return false;
            editor.emit('spellcheckMenu', {
              from: found.from,
              to: found.to,
              word: view.state.doc.textBetween(found.from, found.to),
              rect: target.getBoundingClientRect(),
            });
            return false;
          },
        },
      }),
    ];
  },
});
