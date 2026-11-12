import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { logger } from '../../utils/logger.js';

// Makes uploaded video and audio stream well in the browser. Nothing is
// re-encoded: ffmpeg only copies the streams into a better-ordered container.
//
// MP4 / MOV / M4A: cameras, phones, OBS and many editors write the index
//   ("moov") at the END of the file. A browser can't play a frame without it,
//   so it has to fetch the end first and often buffers most of the file
//   before starting, and the duration shows late or wrong. "faststart" moves
//   the index to the front, so playback starts after the first few hundred KB.
// WebM / MKV: browser recordings (MediaRecorder) have no duration and no seek
//   index, so the player shows 0:00 or a growing length and seeking is slow.
//   A copy remux writes both.
//
// If ffmpeg is missing or fails, the original file is kept unchanged.

const MP4_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v', 'audio/mp4']);
const MATROSKA_FORMATS = {
  'video/webm': 'webm',
  'audio/webm': 'webm',
  'video/x-matroska': 'matroska',
  'audio/x-matroska': 'matroska',
};
const HEADER_BYTES = 16;
// Copying streams runs at disk speed; this only guards against a hung process.
const MIN_TIMEOUT_MS = 2 * 60 * 1000;
const MS_PER_MB = 400;

let ffmpegMissing = false;

// Walks the top-level MP4 boxes and reports whether "moov" comes after "mdat".
// Reads only a few bytes per box, so it is instant even for huge files.
export async function mp4NeedsFaststart(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const { size: fileSize } = await handle.stat();
    const header = Buffer.alloc(HEADER_BYTES);
    let offset = 0;
    let sawMdat = false;
    while (offset + 8 <= fileSize) {
      const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, offset);
      if (bytesRead < 8) return false;
      let boxSize = header.readUInt32BE(0);
      const type = header.toString('latin1', 4, 8);
      if (boxSize === 1) {
        if (bytesRead < 16) return false;
        boxSize = Number(header.readBigUInt64BE(8));
      } else if (boxSize === 0) {
        boxSize = fileSize - offset; // runs to the end of the file
      }
      if (boxSize < 8) return false; // not a well-formed MP4; leave it alone
      if (type === 'moov') return sawMdat;
      // Fragmented MP4 already streams; nothing to fix.
      if (type === 'moof') return false;
      if (type === 'mdat') sawMdat = true;
      offset += boxSize;
    }
    return false;
  } finally {
    await handle.close();
  }
}

function runFfmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg ${signal ? `killed (${signal})` : `exited ${code}`}: ${stderr}`));
    });
  });
}

async function remuxPlan(filePath, mime) {
  if (MP4_MIMES.has(mime)) {
    if (!(await mp4NeedsFaststart(filePath))) return null;
    // Same container family out as in, so every codec the original held still fits.
    const format = { 'video/quicktime': 'mov', 'audio/mp4': 'ipod' }[mime] ?? 'mp4';
    return { format, extra: ['-movflags', '+faststart'] };
  }
  if (MATROSKA_FORMATS[mime]) return { format: MATROSKA_FORMATS[mime], extra: [] };
  return null;
}

/**
 * Rewrites the file at `filePath` in place when that makes it stream better.
 * Returns { size, changed }: the file's (possibly new) size, and whether it was rewritten.
 */
export async function optimizeForStreaming(filePath, mime) {
  const { size: originalSize } = await fs.stat(filePath);
  const unchanged = { size: originalSize, changed: false };
  if (ffmpegMissing) return unchanged;
  let plan;
  try {
    plan = await remuxPlan(filePath, mime);
  } catch (err) {
    logger.warn({ err, mime }, 'Could not inspect media file; storing it as uploaded');
    return unchanged;
  }
  if (!plan) return unchanged;

  const outPath = `${filePath}.stream`;
  const timeoutMs = Math.max(MIN_TIMEOUT_MS, (originalSize / 1024 / 1024) * MS_PER_MB);
  try {
    await runFfmpeg(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        filePath,
        // Every stream (all audio tracks, subtitles), copied bit for bit.
        '-map',
        '0',
        '-c',
        'copy',
        '-map_metadata',
        '0',
        ...plan.extra,
        '-f',
        plan.format,
        outPath,
      ],
      timeoutMs,
    );
    const { size } = await fs.stat(outPath);
    // A remux is never much smaller; a tiny result means streams were dropped.
    if (size < originalSize * 0.9) throw new Error(`remux lost data (${size} of ${originalSize} bytes)`);
    await fs.rename(outPath, filePath);
    return { size, changed: true };
  } catch (err) {
    if (err.code === 'ENOENT' && err.syscall?.startsWith('spawn')) {
      ffmpegMissing = true;
      logger.warn('ffmpeg is not installed: videos are stored without streaming optimisation');
    } else {
      logger.warn({ err, mime }, 'Could not optimise media for streaming; storing it as uploaded');
    }
    await fs.rm(outPath, { force: true });
    return unchanged;
  }
}
