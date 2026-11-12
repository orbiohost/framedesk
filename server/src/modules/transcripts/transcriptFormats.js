// Exports a transcript's segments as plain text or subtitles.

function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

function timestamp(seconds, separator) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${separator}${pad(totalMs % 1000, 3)}`;
}

export function toPlainText(segments) {
  return segments.map((segment) => segment.text).join('\n');
}

export function toSrt(segments) {
  return segments
    .map(
      (segment, index) =>
        `${index + 1}\n${timestamp(segment.start, ',')} --> ${timestamp(segment.end, ',')}\n${segment.text}\n`,
    )
    .join('\n');
}

export function toVtt(segments) {
  const cues = segments
    .map((s) => `${timestamp(s.start, '.')} --> ${timestamp(s.end, '.')}\n${s.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${cues}`;
}

export const EXPORT_FORMATS = {
  txt: { mime: 'text/plain', render: toPlainText },
  srt: { mime: 'application/x-subrip', render: toSrt },
  vtt: { mime: 'text/vtt', render: toVtt },
};
