const MAX_NAME_LENGTH = 200;

// Display names only (files are stored under uuids), but they still end up in
// headers and UI, so strip paths, control characters and reserved symbols.
export function sanitizeFileName(rawName) {
  const baseName = String(rawName ?? '')
    .split(/[\\/]/)
    .pop();
  const cleaned = baseName
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- removing control characters is the point.
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');

  if (cleaned.length <= MAX_NAME_LENGTH) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const extension = dot > 0 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, MAX_NAME_LENGTH - extension.length) + extension;
}
