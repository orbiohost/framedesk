// Copies server-side field errors (400 VALIDATION_ERROR) onto react-hook-form fields.
// Returns true when at least one field error was applied.
export function applyServerFieldErrors(error, setError) {
  const details = error?.details ?? [];
  for (const { field, message } of details) {
    setError(field, { type: 'server', message });
  }
  return details.length > 0;
}
