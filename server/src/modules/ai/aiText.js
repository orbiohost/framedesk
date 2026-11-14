// Small text helpers shared by the analysis worker and the chat.

export function clock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// A transcript as "[m:ss] text" lines, cut off at maxChars.
export function transcriptText(segments, maxChars) {
  let out = '';
  for (const segment of segments ?? []) {
    const line = `[${clock(segment.start)}] ${segment.text.trim()}\n`;
    if (out.length + line.length > maxChars) return `${out}[… transcript continues]`;
    out += line;
  }
  return out.trim();
}

export function truncate(text, maxChars) {
  if (!text) return '';
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

export function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
