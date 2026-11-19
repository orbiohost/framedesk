import { getStorageDriver } from '../../storage/storageDriver.js';
import { logger } from '../../utils/logger.js';
import { requeueForAnalysis } from '../ai/analysisWorker.js';
import { isInBriefsFolder } from '../briefs/briefStale.js';
import { stopIfTooLong } from '../briefs/briefTranscribe.js';
import { StoredFile } from '../files/file.model.js';
import { Transcript } from './transcript.model.js';
import { asr } from './asrClient.js';
import {
  canTranslate,
  isPermanentTranslateError,
  TRANSLATE_BATCH,
  translateSegments,
} from './transcriptTranslate.js';

// Sends queued transcripts to the asr container (Qwen3-ASR) one at a time and
// copies the segments back as they come in; "translate" transcripts are
// translated to English with Gemini on the way. It runs inside the API process, which is
// fine for the single API instance this app runs (see README, "Scaling").
//
// Everything lives in MongoDB, so restarts on either side are safe:
// - API restarts: the "processing" transcript keeps its asrJobId and polling resumes.
// - The asr service restarts: its jobs are gone (404), so the transcript is queued again.

const POLL_INTERVAL_MS = 4000;
const MAX_ATTEMPTS = 3;
// With S3, the asr service downloads the file from a signed link; a job can wait in its
// queue for hours behind long files, so the link outlives that.
const WORKER_URL_TTL_SECONDS = 24 * 60 * 60;
const ALL_WORKSPACES = { crossWorkspace: true };

// Lines the AI translates per tick for a transcript that already had its text.
const AI_TRANSLATE_BATCHES_PER_TICK = 5;

let timer = null;
let ticking = false;
let aiTicking = false;

async function fail(transcript, error) {
  await Transcript.updateOne(
    { _id: transcript._id, workspaceId: transcript.workspaceId },
    {
      $set: { status: 'failed', error, asrJobId: null, finishedAt: new Date() },
    },
  );
  // The AI may be waiting for this transcript (Notes & Briefs): it reads the media instead.
  await requeueForAnalysis(transcript.workspaceId, transcript.fileId, [null]).catch(() => {});
}

async function submit(transcript) {
  const file = await StoredFile.findOne({
    _id: transcript.fileId,
    workspaceId: transcript.workspaceId,
  })
    .select('storageKey')
    .lean();
  if (!file) {
    await fail(transcript, 'The file no longer exists');
    return;
  }
  if (transcript.task === 'translate' && !canTranslate()) {
    await fail(transcript, 'Translation needs the AI assistant (GEMINI_API_KEY), which is off');
    return;
  }
  let jobId;
  try {
    const driver = getStorageDriver();
    jobId = await asr.submitJob({
      storageKey: file.storageKey,
      url: await driver.createWorkerUrl(file.storageKey, WORKER_URL_TTL_SECONDS),
      language: transcript.language,
    });
  } catch (err) {
    // 400/404: this file can never work (e.g. its bytes are missing). Anything
    // else (service down, still loading) is retried on the next tick.
    if (err.status === 400 || err.status === 404) {
      await fail(transcript, err.message);
      return;
    }
    throw err;
  }
  await Transcript.updateOne(
    { _id: transcript._id, workspaceId: transcript.workspaceId },
    { $set: { asrJobId: jobId } },
  );
}

async function requeue(transcript) {
  const attempts = transcript.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await fail(transcript, 'The speech-to-text service kept restarting during this file');
    return;
  }
  await Transcript.updateOne(
    { _id: transcript._id, workspaceId: transcript.workspaceId },
    { $set: { status: 'queued', asrJobId: null, segments: [], progress: 0, attempts } },
  );
}

// In a Notes & Briefs folder a clip already read from its media is read again
// from the new transcript (a quick text call), so the brief gets every word.
async function statesToReread(transcript) {
  const states = ['skipped', 'failed', null];
  const file = await StoredFile.findOne({
    _id: transcript.fileId,
    workspaceId: transcript.workspaceId,
  })
    .select('folderId')
    .lean();
  if (file && (await isInBriefsFolder(transcript.workspaceId, file.folderId))) states.push('done');
  return states;
}

async function poll(transcript) {
  const job = await asr.getJob(transcript.asrJobId, transcript.segments.length);
  if (!job) {
    await requeue(transcript);
    return;
  }
  // An automatic Notes & Briefs transcript of a clip over the uploader's limit.
  if (await stopIfTooLong(transcript, job.duration)) {
    await asr.cancelJob(transcript.asrJobId).catch(() => {});
    return true;
  }

  // Translation: a batch of new lines per tick. Lines not stored yet are simply
  // asked for again next tick (the service keeps them), so a Gemini hiccup
  // only delays the transcript.
  let segments = job.segments ?? [];
  const pending = segments.length;
  if (transcript.task === 'translate' && pending && job.language !== 'en') {
    try {
      segments = await translateSegments(segments.slice(0, TRANSLATE_BATCH));
    } catch (err) {
      if (!isPermanentTranslateError(err)) throw err;
      await fail(transcript, `Translation failed: ${err.message}`);
      await asr.cancelJob(transcript.asrJobId).catch(() => {});
      return true;
    }
  }
  const caughtUp = segments.length === pending;

  const scope = { _id: transcript._id, workspaceId: transcript.workspaceId };
  const update = {
    $set: {
      // Still translating the last lines: not quite finished yet.
      progress: caughtUp ? (job.progress ?? 0) : Math.min(job.progress ?? 0, 0.99),
      detectedLanguage: job.language ?? null,
      durationSec: job.duration ?? null,
    },
  };
  if (segments.length) update.$push = { segments: { $each: segments } };

  if (job.status === 'done' && caughtUp) {
    Object.assign(update.$set, {
      status: 'done',
      progress: 1,
      asrJobId: null,
      finishedAt: new Date(),
    });
  } else if (job.status === 'failed' || job.status === 'cancelled') {
    Object.assign(update.$set, {
      status: 'failed',
      error: job.error || 'Transcription failed',
      asrJobId: null,
      finishedAt: new Date(),
    });
  }

  // Only while still processing this job: someone may have deleted it meanwhile.
  await Transcript.updateOne({ ...scope, asrJobId: transcript.asrJobId }, update);
  const finished = update.$set.asrJobId === null;
  if (finished) await asr.cancelJob(transcript.asrJobId).catch(() => {});
  // A file the assistant couldn't open (too big, odd format) can now be read
  // from its words, and one waiting for its transcript (Notes & Briefs) goes now.
  if (finished) {
    const states = job.status === 'done' ? await statesToReread(transcript) : [null];
    await requeueForAnalysis(transcript.workspaceId, transcript.fileId, states).catch(() => {});
  }
  return finished;
}

// Translates an already transcribed file from its kept lines with the AI,
// next to (not behind) the speech-to-text queue: no audio is processed again.
async function aiTranslateStep() {
  const transcript = await Transcript.findOne({ status: 'processing', aiTranslating: true })
    .sort({ startedAt: 1 })
    .select('workspaceId segments originalSegments')
    .setOptions(ALL_WORKSPACES)
    .lean();
  if (!transcript) return;
  const scope = {
    _id: transcript._id,
    workspaceId: transcript.workspaceId,
    status: 'processing',
    aiTranslating: true,
  };
  const source = transcript.originalSegments ?? [];
  let done = transcript.segments.length;

  for (let round = 0; round < AI_TRANSLATE_BATCHES_PER_TICK && done < source.length; round += 1) {
    let lines;
    try {
      lines = await translateSegments(source.slice(done, done + TRANSLATE_BATCH));
    } catch (err) {
      if (!isPermanentTranslateError(err)) throw err;
      // The original lines stay kept, so "Translate" can simply be tried again.
      await Transcript.updateOne(scope, {
        $set: {
          status: 'failed',
          aiTranslating: false,
          error: `Translation failed: ${err.message}`,
          finishedAt: new Date(),
        },
      });
      return;
    }
    done += lines.length;
    const result = await Transcript.updateOne(scope, {
      $push: { segments: { $each: lines } },
      $set: { progress: Math.min(0.99, done / source.length) },
    });
    if (!result.modifiedCount) return; // deleted or started over meanwhile
  }
  if (done >= source.length) {
    await Transcript.updateOne(scope, {
      $set: { status: 'done', progress: 1, aiTranslating: false, finishedAt: new Date() },
    });
  }
}

async function runAiTranslateTick() {
  if (aiTicking) return;
  aiTicking = true;
  try {
    await aiTranslateStep();
  } catch (err) {
    // Usually Gemini is busy or rate limited; the next tick carries on where it stopped.
    logger.warn({ err }, 'Transcript translation step failed');
  } finally {
    aiTicking = false;
  }
}

async function claimNext() {
  return Transcript.findOneAndUpdate(
    { status: 'queued' },
    { $set: { status: 'processing', startedAt: new Date(), asrJobId: null, segments: [] } },
    { sort: { createdAt: 1 }, new: true },
  )
    .setOptions(ALL_WORKSPACES)
    .lean();
}

// One step: move the current transcript forward, or start the next one.
export async function runTranscriptWorkerTick() {
  if (ticking) return;
  ticking = true;
  try {
    let current = await Transcript.findOne({ status: 'processing', aiTranslating: { $ne: true } })
      .sort({ startedAt: 1 })
      .setOptions(ALL_WORKSPACES)
      .lean();
    // A file that just finished hands over to the next one straight away, so
    // the asr service isn't left idle until the following tick.
    if (current?.asrJobId && !(await poll(current))) return;
    if (current && !current.asrJobId) return submit(current);

    const next = await claimNext();
    if (next) await submit(next);
  } catch (err) {
    // Usually the asr container is down or still loading; try again next tick.
    logger.warn({ err }, 'Transcript worker step failed');
  } finally {
    ticking = false;
  }
}

export function startTranscriptWorker() {
  if (!asr.isEnabled() || timer) return;
  timer = setInterval(() => {
    runTranscriptWorkerTick();
    runAiTranslateTick();
  }, POLL_INTERVAL_MS);
  timer.unref();
  logger.info('Transcript worker started');
}

export function stopTranscriptWorker() {
  clearInterval(timer);
  timer = null;
}
