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
  heic: 'image/heic',
  heif: 'image/heif',
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

const HEIF_EXTENSIONS = new Set(['heic', 'heif']);

// HEIC/HEIF photos are ISO-BMFF files, like MP4. file-type only knows a few
// HEIF brands and labels the rest (heim, heis, mif2, MiHE... used by many
// iPhones and Android phones) as video/mp4, which sent them to the video
// player. A .heic/.heif that sniffed as video or as nothing is a picture.
export function correctedMime(mime, extension = '') {
  if (
    HEIF_EXTENSIONS.has(extension) &&
    (!mime || mime === 'application/octet-stream' || mime.startsWith('video/'))
  ) {
    return INLINE_MIME_BY_EXTENSION[extension];
  }
  return mime;
}

// Prefer what the bytes say (sniffed); fall back to the extension.
export function resolveMime(extension, sniffedMime) {
  return correctedMime(
    sniffedMime || INLINE_MIME_BY_EXTENSION[extension] || 'application/octet-stream',
    extension,
  );
}

// Formats the viewer opens even though the browser can't show the bytes as
// they are: the client converts HEIC/HEIF (iPhone photos), TIFF, PSD and camera
// RAW to a picture, shows text files as text and fonts as a type specimen.
const VIEWER_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'heic',
  'heif',
  'tif',
  'tiff',
  'psd',
  'psb',
  'cr2',
  'cr3',
  'nef',
  'arw',
  'dng',
  'raf',
  'txt',
  'md',
  'csv',
  'srt',
  'vtt',
  'otf',
  'ttf',
  'woff',
  'woff2',
]);

// Opened as plain text whatever was sniffed (text has no magic bytes).
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'srt', 'vtt']);

// Images the viewer can't show (EXR, DPX) stay download-only.
const UNVIEWABLE_IMAGE_EXTENSIONS = new Set(['exr', 'dpx']);

export function isPreviewable(mime, extension = '') {
  if (BLOCKED_MIMES.has(mime)) return false;
  if (mime.startsWith('video/') || mime.startsWith('audio/') || mime === 'application/pdf') {
    return true;
  }
  if (VIEWER_EXTENSIONS.has(extension)) return true;
  return mime.startsWith('image/') && !UNVIEWABLE_IMAGE_EXTENSIONS.has(extension);
}

// The type an inline link answers with. Text is always plain text, so a .txt
// that really holds HTML can't render as a page.
export function inlineMime(mime, extension = '') {
  if (TEXT_EXTENSIONS.has(extension)) return 'text/plain; charset=utf-8';
  return mime;
}
