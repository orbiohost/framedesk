import { forwardRef, useRef } from 'react';
import { SpellcheckLayer } from '../../features/spellcheck/SpellcheckLayer.jsx';
import { cn } from '../../lib/cn.js';
import { mergeRefs } from '../../lib/insertText.js';
import { FieldShell, controlClassName } from './FieldShell.jsx';
import { useFieldDictation } from './useFieldDictation.jsx';

// dictationWorkspaceId: adds a mic button that types what you say.
// Spelling is checked by the app's own checker (spellCheck={false} turns it off).
export const TextAreaField = forwardRef(function TextAreaField(
  { id, label, error, hint, className, rows = 4, dictationWorkspaceId, ...textareaProps },
  ref,
) {
  const own = useRef(null);
  const checkSpelling = textareaProps.spellCheck !== false;
  const dictation = useFieldDictation(dictationWorkspaceId, {
    disabled: textareaProps.disabled || textareaProps.readOnly,
    multiline: true,
    label,
  });

  return (
    <FieldShell
      id={id}
      label={label}
      error={error}
      hint={hint}
      alert={dictation.alert}
      className={className}
    >
      {(aria) => (
        <div className="relative">
          <textarea
            ref={mergeRefs(ref, dictation.controlRef, own)}
            rows={rows}
            className={cn(
              controlClassName(error),
              'scrollbar-thin min-h-[4.5rem] py-2 leading-6',
              dictation.active && 'pr-11',
            )}
            {...aria}
            {...textareaProps}
          />
          {checkSpelling && <SpellcheckLayer textareaRef={own} value={textareaProps.value} />}
          {dictation.button && (
            <span className="absolute bottom-2.5 right-1">{dictation.button}</span>
          )}
        </div>
      )}
    </FieldShell>
  );
});
