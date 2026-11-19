import { spawn } from 'node:child_process';
import { getStorageDriver } from '../../storage/storageDriver.js';
import { logger } from '../../utils/logger.js';
import { StoredFile } from '../files/file.model.js';
import { asr } from '../transcripts/asrClient.js';
import { isInBriefsFolder } from './briefStale.js';
import { Transcript } from '../transcripts/transcript.model.js';
import { autoTranscribeMinutesOf } from '../users/transcribePrefs.js';
import { User } from '../users/user.model.js';

// Audio and video put in a project's "Notes & Briefs" folder are transcribed
// by themselves with the local speech-to-text service (Qwen3-ASR), as long as
// the clip is no longer than the uploader's limit (Account → Profile, default
// 60 minutes). The AI then reads the transcript instead of the media, which
// is faster and costs far fewer credits (see ai/analysisWorker.js).
//
// file.autoTranscribe records the decision, so each clip is looked at once.

const CLIP_CATEGORIES = new Set(['audio', 'video']);
const PROBE_TIMEOUT_MS = 30_000;
const PROBE_URL_TTL_SECONDS = 10 * 60;
const DUPLICATE_KEY = 11000;

let ffprobeMissing = false;

export function isClip(file) {
  return CLIP_CATEGORIES.has(file?.category);
}

// The clip's length in seconds from ffprobe, or null when it can't tell.
async function probeDuration(file) {
  if (ffprobeMissing) return null;
  const url = await getStorageDriver().createWorkerUrl(file.storageKey, PROBE_URL_TTL_SECONDS);
  return new Promise((resolve) => {
    let output = '';
    let child;
    try {
      child = spawn(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', url],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), PROBE_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        ffprobeMissing = true;
        logger.warn('ffprobe is not installed: clip lengths are checked by speech-to-text instead');
      }
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const seconds = Number.parseFloat(output.trim());
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    });
  });
}

async function decide(file) {
  // Claim it, so two callers never queue the same clip.
  const claimed = await StoredFile.findOneAndUpdate(
    { _id: file._id, workspaceId: file.workspaceId, autoTranscribe: null, deletedAt: null },
    { $set: { autoTranscribe: 'queued' } },
    { new: true },
  ).lean();
  if (!claimed) return;
  const set = (changes) =>
    StoredFile.updateOne({ _id: file._id, workspaceId: file.workspaceId }, { $set: changes });

  // Already transcribed or being transcribed (e.g. by hand): nothing to do.
  if (await Transcript.exists({ workspaceId: file.workspaceId, fileId: file._id })) return;

  const uploader = await User.findById(claimed.uploadedBy).select('autoTranscribeMinutes').lean();
  const minutes = autoTranscribeMinutesOf(uploader);
  if (minutes <= 0) {
    await set({ autoTranscribe: 'off' });
    return;
  }

  const duration = claimed.mediaDurationSec ?? (await probeDuration(claimed).catch(() => null));
  if (duration && duration !== claimed.mediaDurationSec) {
    await set({ mediaDurationSec: Math.round(duration) });
  }
  if (duration && duration > minutes * 60) {
    await set({ autoTranscribe: 'too_long' });
    return;
  }

  try {
    await Transcript.create({
      workspaceId: file.workspaceId,
      fileId: file._id,
      status: 'queued',
      task: 'transcribe',
      requestedBy: claimed.uploadedBy,
      // Length unknown: speech-to-text stops it if it turns out too long.
      autoMaxSec: minutes * 60,
    });
  } catch (err) {
    if (err.code !== DUPLICATE_KEY) throw err;
  }
}

/**
 * Queues the transcripts of these files that are Notes & Briefs clips not
 * looked at yet. Never throws: a missing transcript only means the AI reads
 * the media itself.
 */
export async function autoTranscribeBriefFiles(files) {
  if (!asr.isEnabled()) return;
  for (const file of files) {
    if (!isClip(file) || file.autoTranscribe || file.deletedAt) continue;
    try {
      await decide(file);
    } catch (err) {
      logger.warn({ err: err.message, fileId: String(file._id) }, 'Could not auto-transcribe');
    }
  }
}

// For one file that just arrived somewhere (upload, move, restore).
export async function autoTranscribeIfInBriefs(workspaceId, fileId) {
  if (!asr.isEnabled()) return;
  try {
    const file = await StoredFile.findOne({ _id: fileId, workspaceId }).lean();
    if (!isClip(file) || file.autoTranscribe) return;
    if (!(await isInBriefsFolder(workspaceId, file.folderId))) return;
    await autoTranscribeBriefFiles([file]);
  } catch (err) {
    logger.warn({ err: err.message, fileId: String(fileId) }, 'Could not auto-transcribe');
  }
}

/**
 * Called by speech-to-text once it knows a clip's length: an automatic
 * transcript of a clip over its limit is stopped. Returns true when stopped.
 */
export async function stopIfTooLong(transcript, durationSec) {
  if (!transcript.autoMaxSec || !durationSec || durationSec <= transcript.autoMaxSec) return false;
  await Transcript.deleteOne({ _id: transcript._id, workspaceId: transcript.workspaceId });
  await StoredFile.updateOne(
    { _id: transcript.fileId, workspaceId: transcript.workspaceId },
    {
      $set: {
        autoTranscribe: 'too_long',
        mediaDurationSec: Math.round(durationSec),
        // The AI was waiting for the transcript; it reads the media instead.
        aiRetryAt: null,
      },
    },
  );
  return true;
}
