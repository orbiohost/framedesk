// What the viewer does with each kind of file. The server decides a file is
// previewable at all; this decides how it is shown once it is.

// Pictures every current browser draws as they are.
const NATIVE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);
const HEIC_EXTENSIONS = new Set(['heic', 'heif']);
const TIFF_EXTENSIONS = new Set(['tif', 'tiff']);
const PSD_EXTENSIONS = new Set(['psd', 'psb']);
// Camera RAW: shown through the full-size JPEG the camera embeds in the file.
const RAW_EXTENSIONS = new Set(['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'srt', 'vtt']);
const FONT_EXTENSIONS = new Set(['otf', 'ttf', 'woff', 'woff2']);

const HEIC_MIMES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

export function isPlayable(file) {
  // A HEIC photo is never a video, whatever its stored type says (older
  // uploads could be labelled video/mp4).
  if (HEIC_EXTENSIONS.has((file.extension ?? '').toLowerCase())) return false;
  return file.mime.startsWith('video/') || file.mime.startsWith('audio/');
}

// 'heic' | 'tiff' | 'psd' | 'raw' when the picture has to be converted in the
// browser first, null when an <img> shows it as it is.
export function imageDecoder(file) {
  const extension = (file.extension ?? '').toLowerCase();
  // RAW first: DNG and friends are TIFF inside, but their embedded JPEG is the
  // picture worth showing.
  if (RAW_EXTENSIONS.has(extension)) return 'raw';
  // Then what the bytes said: an iPhone photo renamed .jpg is still HEIC.
  if (HEIC_MIMES.has(file.mime)) return 'heic';
  if (file.mime === 'image/tiff') return 'tiff';
  if (file.mime === 'image/vnd.adobe.photoshop') return 'psd';
  if (HEIC_EXTENSIONS.has(extension)) return 'heic';
  if (TIFF_EXTENSIONS.has(extension)) return 'tiff';
  if (PSD_EXTENSIONS.has(extension)) return 'psd';
  if (NATIVE_IMAGE_EXTENSIONS.has(extension)) return null;
  // Other image types the camera makers label themselves (image/x-canon-cr2...).
  if (/^image\/x-(canon|nikon|sony|adobe-dng|fuji|panasonic|olympus|pentax)/.test(file.mime)) {
    return 'raw';
  }
  return null;
}

export function isImageFile(file) {
  const extension = (file.extension ?? '').toLowerCase();
  return (
    file.mime.startsWith('image/') ||
    NATIVE_IMAGE_EXTENSIONS.has(extension) ||
    HEIC_EXTENSIONS.has(extension) ||
    TIFF_EXTENSIONS.has(extension) ||
    PSD_EXTENSIONS.has(extension) ||
    RAW_EXTENSIONS.has(extension)
  );
}

// True when a plain <img src> shows the file (no conversion needed).
export function showsNatively(file) {
  return isImageFile(file) && imageDecoder(file) === null;
}

// How the viewer shows a previewable file.
// 'media' | 'image' | 'text' | 'font' | 'frame' (PDF and anything else in an iframe)
export function viewerKind(file) {
  const extension = (file.extension ?? '').toLowerCase();
  if (isPlayable(file)) return 'media';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  if (FONT_EXTENSIONS.has(extension) || file.mime.startsWith('font/')) return 'font';
  if (isImageFile(file)) return 'image';
  return 'frame';
}
