// Converts media the browser can't play into MP4/M4A on the viewer's own
// device with ffmpeg.wasm, so the server never transcodes anything.
//
// - The ffmpeg engine (~31 MB) is fetched from a CDN on first use and then
//   sits in the browser's HTTP cache; it is never served by our VPS.
// - The source is mounted with WORKERFS, so even a large file is read in place
//   instead of being copied into WebAssembly memory.
// - Streams the browser already decodes are copied as they are (a "remux",
//   which takes seconds). Only unsupported codecs are re-encoded.
// - Finished conversions are kept in the browser's Cache Storage, so opening
//   the same file later (even after a reload) plays at once instead of
//   converting again. They are wiped on sign-out (clearConvertedMedia).

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm';
const MAX_SOURCE_BYTES = 2 * 1024 ** 3;
const CACHE_LIMIT = 3;

export const AUTO_CONVERT_MAX_BYTES = 600 * 1024 ** 2;

let enginePromise = null;
// fileId -> { url, remuxed }; converted copies are kept while the tab is open.
const converted = new Map();

const STORE_NAME = 'framedesk-converted-v1';
// The newest few conversions are kept on disk, each up to this size.
const STORE_LIMIT = 4;
const STORE_MAX_BYTES = 800 * 1024 ** 2;
// fileId -> Promise, so two lookups of one file share one object URL.
const restoring = new Map();

export function cachedConversion(fileId) {
  return converted.get(fileId) ?? null;
}

function remember(fileId, entry) {
  converted.set(fileId, entry);
  while (converted.size > CACHE_LIMIT) {
    const [oldestId, oldest] = converted.entries().next().value;
    URL.revokeObjectURL(oldest.url);
    converted.delete(oldestId);
  }
}

// A new upload over the same file id (versions) or a different size gets a new key.
function storeKey(file) {
  return `/__converted/${file.id}?v=${file.version ?? 1}&s=${file.size}`;
}

async function openStore() {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(STORE_NAME);
  } catch {
    return null; // Private mode, or storage blocked.
  }
}

async function storeConversion(file, blob, { remuxed, videoCopied }) {
  if (blob.size > STORE_MAX_BYTES) return;
  const store = await openStore();
  if (!store) return;
  try {
    await store.delete(`/__converted/${file.id}`, { ignoreSearch: true });
    await store.put(
      storeKey(file),
      new Response(blob, {
        headers: {
          'Content-Type': blob.type,
          'X-Remuxed': remuxed ? '1' : '0',
          'X-Video-Copied': videoCopied ? '1' : '0',
        },
      }),
    );
    // keys() lists entries oldest first; keep only the newest few.
    const keys = await store.keys();
    await Promise.all(keys.slice(0, -STORE_LIMIT).map((request) => store.delete(request)));
  } catch {
    // Over quota: the copy in memory still plays for this visit.
  }
}

// A conversion of this file kept from an earlier visit, or null.
export function findStoredConversion(file) {
  const inMemory = cachedConversion(file.id);
  if (inMemory) return Promise.resolve(inMemory);
  if (!restoring.has(file.id)) {
    const lookup = (async () => {
      const store = await openStore();
      const response = await store?.match(storeKey(file)).catch(() => null);
      if (!response) return null;
      const blob = await response.blob();
      const entry = {
        url: URL.createObjectURL(blob),
        remuxed: response.headers.get('X-Remuxed') === '1',
        // Copies stored before this header existed may have copied the video.
        videoCopied: response.headers.get('X-Video-Copied') !== '0',
      };
      remember(file.id, entry);
      return entry;
    })()
      .catch(() => null)
      .finally(() => restoring.delete(file.id));
    restoring.set(file.id, lookup);
  }
  return restoring.get(file.id);
}

// Forgets one file's converted copy, in memory and on disk (it didn't play).
export async function forgetConversion(file) {
  const entry = converted.get(file.id);
  if (entry) URL.revokeObjectURL(entry.url);
  converted.delete(file.id);
  const store = await openStore();
  await store?.delete(`/__converted/${file.id}`, { ignoreSearch: true }).catch(() => {});
}

// Forgets every converted copy, in memory and on disk (on sign-out).
export async function clearConvertedMedia() {
  for (const entry of converted.values()) URL.revokeObjectURL(entry.url);
  converted.clear();
  try {
    if (typeof caches !== 'undefined') await caches.delete(STORE_NAME);
  } catch {
    // Storage blocked: nothing was stored either.
  }
}

async function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ffmpeg;
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

// Stops a running conversion. The engine is reloaded on the next use.
export async function cancelConversion() {
  if (!enginePromise) return;
  const pending = enginePromise;
  enginePromise = null;
  try {
    (await pending).terminate();
  } catch {
    // Already gone.
  }
}

async function downloadSource(url, onProgress, signal) {
  // S3 links are cross-origin, so no cookies are sent with them.
  const response = await fetch(url, {
    signal,
    mode: 'cors',
    credentials: 'same-origin',
    // A <video>/<img> may already have loaded this link without CORS, and S3
    // doesn't send Vary: Origin then, so a cached copy would fail the CORS check.
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('The file could not be downloaded for conversion.');
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || !total) return response.blob();

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received / total);
  }
  return new Blob(chunks);
}

function parseDuration(log) {
  const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
}

function streamCodec(log, kind) {
  const match = new RegExp(`Stream #\\d+:\\d+[^:]*: ${kind}: (\\w+)`).exec(log);
  return match ? match[1].toLowerCase() : null;
}

function browserDecodes(mime) {
  try {
    return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mime);
  } catch {
    return false;
  }
}

const COPYABLE_VIDEO = {
  h264: 'video/mp4; codecs="avc1.42E01E"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  av1: 'video/mp4; codecs="av01.0.05M.08"',
  vp9: 'video/mp4; codecs="vp09.00.10.08"',
};
const COPYABLE_AUDIO = {
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  mp3: 'audio/mp4; codecs="mp4a.6B"',
  opus: 'audio/mp4; codecs="opus"',
  flac: 'audio/mp4; codecs="flac"',
};

function canCopy(table, codec) {
  return Boolean(codec && table[codec] && browserDecodes(table[codec]));
}

// Picks the cheapest ffmpeg arguments that give a playable file.
// reencode: never copy the video stream (a copied one already failed to play;
// HEVC in particular is often reported as supported but won't decode).
function planArguments({ input, output, isVideo, videoCodec, audioCodec, reencode }) {
  const copyVideo = !reencode && canCopy(COPYABLE_VIDEO, videoCodec);
  const copyAudio = canCopy(COPYABLE_AUDIO, audioCodec);
  const audio = copyAudio ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k', '-ac', '2'];

  if (!isVideo || !videoCodec) {
    return {
      remuxed: copyAudio,
      videoCopied: false,
      args: ['-i', input, '-vn', '-map', '0:a:0', ...audio, output],
    };
  }
  const video = copyVideo
    ? ['-c:v', 'copy']
    : [
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-tune',
        'fastdecode',
        '-crf',
        '26',
        // 720p keeps single-threaded WebAssembly encoding bearable for a preview.
        '-vf',
        "scale='min(1280,iw)':-2",
        '-pix_fmt',
        'yuv420p',
      ];
  return {
    remuxed: copyVideo && copyAudio,
    videoCopied: copyVideo,
    args: [
      '-i',
      input,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      ...video,
      ...(audioCodec ? audio : []),
      '-movflags',
      '+faststart',
      output,
    ],
  };
}

// onStatus({ phase: 'engine'|'download'|'analyse'|'convert', progress: 0..1, remuxed? })
// reencode: always re-encode the video (skips any stored copy).
// Resolves { url, remuxed, videoCopied }.
export async function convertForPlayback({ file, sourceUrl, onStatus, signal, reencode = false }) {
  if (!reencode) {
    const cached = await findStoredConversion(file);
    if (cached) return cached;
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('This file is too large to convert in the browser. Download it to play it.');
  }

  const isVideo = file.category === 'video' || file.mime.startsWith('video/');
  onStatus({ phase: 'engine', progress: 0 });
  const [ffmpeg, blob] = await Promise.all([
    loadEngine(),
    downloadSource(sourceUrl, (progress) => onStatus({ phase: 'download', progress }), signal),
  ]);

  const mountPoint = `/in-${crypto.randomUUID()}`;
  const input = `${mountPoint}/source.${file.extension || 'bin'}`;
  const output = `out-${crypto.randomUUID()}.${isVideo ? 'mp4' : 'm4a'}`;
  let log = '';
  let duration = 0;
  let remuxed = false;
  let videoCopied = false;
  const onLog = ({ message }) => {
    log += `${message}\n`;
  };
  const onProgress = ({ time }) => {
    // `time` is in microseconds of output written.
    if (duration)
      onStatus({ phase: 'convert', progress: Math.min(1, time / 1e6 / duration), remuxed });
  };

  await ffmpeg.createDir(mountPoint);
  await ffmpeg.mount('WORKERFS', { files: [new File([blob], input.split('/').pop())] }, mountPoint);
  ffmpeg.on('log', onLog);
  ffmpeg.on('progress', onProgress);
  try {
    onStatus({ phase: 'analyse', progress: 0 });
    await ffmpeg.exec(['-hide_banner', '-i', input]).catch(() => {});
    duration = parseDuration(log);
    const plan = planArguments({
      input,
      output,
      isVideo,
      videoCodec: streamCodec(log, 'Video'),
      audioCodec: streamCodec(log, 'Audio'),
      reencode,
    });
    remuxed = plan.remuxed;
    videoCopied = plan.videoCopied;
    onStatus({ phase: 'convert', progress: 0, remuxed });

    const exitCode = await ffmpeg.exec(['-hide_banner', '-y', ...plan.args]);
    if (exitCode !== 0) throw new Error("This file couldn't be converted. Download it instead.");

    const data = await ffmpeg.readFile(output);
    const result = new Blob([data], { type: isVideo ? 'video/mp4' : 'audio/mp4' });
    const entry = { url: URL.createObjectURL(result), remuxed, videoCopied };
    const previous = converted.get(file.id);
    if (previous) URL.revokeObjectURL(previous.url);
    converted.delete(file.id);
    remember(file.id, entry);
    storeConversion(file, result, entry);
    return entry;
  } finally {
    ffmpeg.off('log', onLog);
    ffmpeg.off('progress', onProgress);
    await ffmpeg.deleteFile(output).catch(() => {});
    await ffmpeg.unmount(mountPoint).catch(() => {});
    await ffmpeg.deleteDir(mountPoint).catch(() => {});
  }
}
