// Response headers for stored media, baked into the S3 signed links.

export function contentDisposition(disposition, fileName) {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

// QuickTime (.mov) and .m4v are the same ISO-BMFF container as MP4, but
// Chrome, Edge and Firefox refuse to play anything labelled video/quicktime or
// video/x-m4v. For inline playback they get labelled MP4, so the H.264/AAC
// files most cameras and phones record play natively. Downloads keep the real type.
const PLAYBACK_MIME_ALIASES = {
  'video/quicktime': 'video/mp4',
  'video/x-m4v': 'video/mp4',
};

export function playbackMime({ mime, disposition }) {
  return disposition === 'inline' ? (PLAYBACK_MIME_ALIASES[mime] ?? mime) : mime;
}
