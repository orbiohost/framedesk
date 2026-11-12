import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';
import { mergeRefs } from '../../lib/insertText.js';
import { FieldShell, controlClassName } from './FieldShell.jsx';
import { useFieldDictation } from './useFieldDictation.jsx';

// Wired for react-hook-form's register().
// dictationWorkspaceId: adds a mic button that types what you say.
export const TextField = forwardRef(function TextField(
  { id, label, error, hint, className, dictationWorkspaceId, ...inputProps },
  ref,
) {
  const dictation = useFieldDictation(dictationWorkspaceId, {
    disabled: inputProps.disabled || inputProps.readOnly,
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
          <input
            ref={mergeRefs(ref, dictation.controlRef)}
            className={cn(controlClassName(error), 'h-10', dictation.active && 'pr-11')}
            {...aria}
            {...inputProps}
          />
          {dictation.button}
        </div>
      )}
    </FieldShell>
  );
});
