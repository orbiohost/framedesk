// Upload allowlist, grouped the way the file explorer shows them.
// SVG and HTML are left out on purpose: they can carry scripts.
const EXTENSIONS_BY_CATEGORY = {
  video: [
    'mp4',
    'mov',
    'm4v',
    'mxf',
    'avi',
    'mkv',
    'webm',
    'mts',
    'm2ts',
    'ts',
    'mpeg',
    'mpg',
    'm2v',
    'vob',
    '3gp',
    '3g2',
    'ogv',
    'wmv',
    'flv',
    'r3d',
    'braw',
  ],
  image: [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'tif',
    'tiff',
    'heic',
    'heif',
    'bmp',
    'psd',
    'psb',
    'cr2',
    'cr3',
    'nef',
    'arw',
    'dng',
    'raf',
    'exr',
    'dpx',
  ],
  audio: [
    'wav',
    'mp3',
    'aac',
    'm4a',
    'aif',
    'aiff',
    'flac',
    'ogg',
    'oga',
    'opus',
    'weba',
    'wma',
    'amr',
    'ac3',
    'mka',
  ],
  document: [
    'pdf',
    'txt',
    'md',
    'rtf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'csv',
    'ppt',
    'pptx',
    'key',
    'pages',
    'numbers',
    'srt',
    'vtt',
  ],
  project: [
    'ai',
    'eps',
    'indd',
    'idml',
    'sketch',
    'fig',
    'xd',
    'aep',
    'aepx',
    'prproj',
    'drp',
    'fcpxml',
    'xml',
    'mogrt',
    'c4d',
    'blend',
    'fbx',
    'obj',
    'otf',
    'ttf',
    'woff',
    'woff2',
    'cube',
    'lut',
  ],
  archive: ['zip', '7z', 'rar'],
};

export const FILE_CATEGORIES = Object.keys(EXTENSIONS_BY_CATEGORY);

const CATEGORY_BY_EXTENSION = new Map(
  Object.entries(EXTENSIONS_BY_CATEGORY).flatMap(([category, extensions]) =>
    extensions.map((extension) => [extension, category]),
  ),
);

// MIME types by extension, used when the bytes don't identify themselves.
// Every video/ and audio/ type opens in the player: the browser plays what it
// can natively, and the player converts the rest on the viewer's own device.
const INLINE_MIME_BY_EXTENSION = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mts: 'video/mp2t',
  m2ts: 'video/mp2t',
  ts: 'video/mp2t',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  m2v: 'video/mpeg',
  vob: 'video/mpeg',
  '3gp': 'video/3gpp',
  '3g2': 'video/3gpp2',
  ogv: 'video/ogg',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  mxf: 'application/mxf',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  weba: 'audio/webm',
  wma: 'audio/x-ms-wma',
  amr: 'audio/amr',
  ac3: 'audio/ac3',
  mka: 'audio/x-matroska',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  pdf: 'application/pdf',
};

// Content that is refused whatever its file name claims.
const BLOCKED_MIMES = new Set([
  'application/x-msdownload',
  'application/vnd.microsoft.portable-executable',
  'application/x-msi',
  'application/x-elf',
  'application/x-mach-binary',
  'application/x-sharedlib',
  'application/x-executable',
  'application/x-deb',
  'application/x-rpm',
  'application/x-apple-diskimage',
  'application/java-archive',
  'text/html',
  'image/svg+xml',
]);

export function extensionOf(fileName) {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function categoryFor(extension) {
  return CATEGORY_BY_EXTENSION.get(extension) ?? null;
}

export function allowedExtensions() {
  return [...CATEGORY_BY_EXTENSION.keys()];
}

export function isBlockedMime(mime) {
  return BLOCKED_MIMES.has(mime);
}

// Prefer what the bytes say (sniffed); fall back to the extension.
export function resolveMime(extension, sniffedMime) {
  if (sniffedMime) return sniffedMime;
  return INLINE_MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export function isPreviewable(mime) {
  return (
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    (mime.startsWith('image/') && mime !== 'image/svg+xml') ||
    mime === 'application/pdf'
  );
}
