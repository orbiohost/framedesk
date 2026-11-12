// What Whisper can read and the viewer can play. Camera RAW (.r3d, .braw) and
// .mxf are left out: they upload fine to the Drive but can't be transcribed here.
const AUDIO = 'wav mp3 aac m4a aif aiff flac ogg oga opus weba wma amr ac3 mka';
const VIDEO = 'mp4 mov m4v avi mkv webm mts m2ts ts mpeg mpg m2v vob 3gp 3g2 ogv wmv flv';
const EXTENSIONS = new Set(`${AUDIO} ${VIDEO}`.split(' '));

// For the file picker's `accept`.
export const TRANSCRIBE_ACCEPT = [
  'audio/*',
  'video/*',
  ...[...EXTENSIONS].map((ext) => `.${ext}`),
].join(',');

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

// Splits picked or dropped files into ones that can be transcribed and the rest.
export function splitTranscribable(fileList) {
  const files = [...fileList];
  const accepted = files.filter((file) => EXTENSIONS.has(extensionOf(file.name)));
  return { accepted, rejected: files.filter((file) => !accepted.includes(file)) };
}

// Where a transcript's recording lives, as a short label and a link.
export function locationLabel(location) {
  if (!location) return null;
  const space = location.projectId ? (location.projectName ?? 'Project') : 'Drive';
  return location.folderName ? `${space} › ${location.folderName}` : space;
}

export function locationHref(workspaceId, location) {
  const base = location.projectId
    ? `/w/${workspaceId}/projects/${location.projectId}/files`
    : `/w/${workspaceId}/drive`;
  return `${base}?folder=${location.folderId}`;
}
