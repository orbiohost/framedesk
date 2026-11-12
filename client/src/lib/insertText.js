// Puts text into an <input> or <textarea> as if it had been typed, so React's
// onChange and react-hook-form's register() both see it.

function setNativeValue(element, value) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Inserts `text` at the cursor when the field has focus, otherwise at the end.
 * Adds a space either side where needed and respects maxLength.
 */
export function insertSpokenText(element, text) {
  if (!element || !text) return;
  const { value } = element;
  const focused = document.activeElement === element;
  let start = value.length;
  let end = value.length;
  if (focused) {
    try {
      start = element.selectionStart ?? start;
      end = element.selectionEnd ?? end;
    } catch {
      // Some input types (email, number) have no selection.
    }
  }

  const before = value.slice(0, start);
  const after = value.slice(end);
  let insert = text.trim();
  if (before && !/\s$/.test(before)) insert = ` ${insert}`;
  if (after && !/^\s/.test(after)) insert = `${insert} `;

  const max = element.maxLength > 0 ? element.maxLength : Infinity;
  insert = insert.slice(0, Math.max(0, max - before.length - after.length));
  if (!insert) return;

  setNativeValue(element, before + insert + after);
  const caret = before.length + insert.length;
  element.focus();
  try {
    element.setSelectionRange(caret, caret);
  } catch {
    // As above: not every input type supports a selection.
  }
}

// One ref for both the caller (e.g. register()) and the component itself.
export function mergeRefs(...refs) {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    });
  };
}
