import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { mergeRefs } from '../../lib/insertText.js';
import { FieldShell, controlClassName } from './FieldShell.jsx';
import { useFieldDictation } from './useFieldDictation.jsx';

// Wired for react-hook-form's register().
// dictationWorkspaceId: adds a mic button that types what you say.
// size "lg": the one headline field of a form (a title), taller with larger type.
export const TextField = forwardRef(function TextField(
  { id, label, error, hint, hideLabel, size, className, dictationWorkspaceId, ...inputProps },
  ref,
) {
  const dictation = useFieldDictation(dictationWorkspaceId, {
    disabled: inputProps.disabled || inputProps.readOnly,
    label,
  });
  const large = size === 'lg';
  // Password fields get an eye button that shows or hides what was typed.
  const isPassword = inputProps.type === 'password';
  const [passwordShown, setPasswordShown] = useState(false);
  const type = isPassword && passwordShown ? 'text' : inputProps.type;

  return (
    <FieldShell
      id={id}
      label={label}
      error={error}
      hint={hint}
      alert={dictation.alert}
      hideLabel={hideLabel}
      className={className}
    >
      {(aria) => (
        <div className="relative">
          <input
            ref={mergeRefs(ref, dictation.controlRef)}
            className={cn(
              controlClassName(error),
              large ? 'h-12 px-3.5 text-[17px] font-medium' : 'h-10',
              (dictation.active || isPassword) && 'pr-11',
            )}
            {...aria}
            {...inputProps}
            type={type}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setPasswordShown((shown) => !shown)}
              disabled={inputProps.disabled}
              aria-label={passwordShown ? 'Hide password' : 'Show password'}
              aria-pressed={passwordShown}
              aria-controls={id}
              title={passwordShown ? 'Hide password' : 'Show password'}
              className={cn(
                'text-muted hover:text-ink absolute right-1 grid h-8 w-8 place-items-center rounded-md transition-colors focus-visible:outline-2 disabled:opacity-50',
                large ? 'top-2' : 'top-1',
              )}
            >
              {passwordShown ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
          {dictation.button && (
            <span className={cn('absolute right-1', large ? 'top-2' : 'top-1')}>
              {dictation.button}
            </span>
          )}
        </div>
      )}
    </FieldShell>
  );
});
