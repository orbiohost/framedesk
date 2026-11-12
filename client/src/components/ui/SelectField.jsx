import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';
import { FieldShell, controlClassName } from './FieldShell.jsx';

// options: [{ value, label }]. A placeholder adds an empty first option.
export const SelectField = forwardRef(function SelectField(
  { id, label, error, hint, className, options, placeholder, ...selectProps },
  ref,
) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      {(aria) => (
        <select
          ref={ref}
          className={cn(controlClassName(error), 'h-10 pr-8')}
          {...aria}
          {...selectProps}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
});
