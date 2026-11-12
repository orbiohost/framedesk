import { getStorageDriver } from '../../storage/storageDriver.js';
import { logger } from '../../utils/logger.js';
import { StoredFile } from '../files/file.model.js';
import { Transcript } from './transcript.model.js';
import { whisper } from './whisperClient.js';

// Sends queued transcripts to the whisper container one at a time and copies
// the segments back as they come in. It runs inside the API process, which is
// fine for the single API instance this app runs (see README, "Scaling").
//
// Everything lives in MongoDB, so restarts on either side are safe:
// - API restarts: the "processing" transcript keeps its whisperJobId and polling resumes.
// - Whisper restarts: its jobs are gone (404), so the transcript is queued again.

const POLL_INTERVAL_MS = 4000;
const MAX_ATTEMPTS = 3;
// With S3, Whisper downloads the file from a signed link; a job can wait in its
// queue for hours behind long files, so the link outlives that.
const WORKER_URL_TTL_SECONDS = 24 * 60 * 60;
const ALL_WORKSPACES = { crossWorkspace: true };

let timer = null;
let ticking = false;

async function fail(transcript, error) {
  await Transcript.updateOne(
    { _id: transcript._id, workspaceId: transcript.workspaceId },
    {
      $set: { status: 'failed', error, whisperJobId: null, finishedAt: new Date() },
    },
  );
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
  let jobId;
  try {
    const driver = getStorageDriver();
    jobId = await whisper.submitJob({
      storageKey: file.storageKey,
      url: await driver.createWorkerUrl(file.storageKey, WORKER_URL_TTL_SECONDS),
      language: transcript.language,
      task: transcript.task,
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
    { $set: { whisperJobId: jobId } },
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
    { $set: { status: 'queued', whisperJobId: null, segments: [], progress: 0, attempts } },
  );
}

async function poll(transcript) {
  const job = await whisper.getJob(transcript.whisperJobId, transcript.segments.length);
  if (!job) {
    await requeue(transcript);
    return;
  }

  const scope = { _id: transcript._id, workspaceId: transcript.workspaceId };
  const update = {
    $set: {
      progress: job.progress ?? 0,
      detectedLanguage: job.language ?? null,
      durationSec: job.duration ?? null,
    },
  };
  if (job.segments?.length) update.$push = { segments: { $each: job.segments } };

  if (job.status === 'done') {
    Object.assign(update.$set, {
      status: 'done',
      progress: 1,
      whisperJobId: null,
      finishedAt: new Date(),
    });
  } else if (job.status === 'failed' || job.status === 'cancelled') {
    Object.assign(update.$set, {
      status: 'failed',
      error: job.error || 'Transcription failed',
      whisperJobId: null,
      finishedAt: new Date(),
    });
  }

  // Only while still processing this job: someone may have deleted it meanwhile.
  await Transcript.updateOne({ ...scope, whisperJobId: transcript.whisperJobId }, update);
  const finished = update.$set.whisperJobId === null;
  if (finished) await whisper.cancelJob(transcript.whisperJobId).catch(() => {});
  return finished;
}

async function claimNext() {
  return Transcript.findOneAndUpdate(
    { status: 'queued' },
    { $set: { status: 'processing', startedAt: new Date(), whisperJobId: null, segments: [] } },
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
    let current = await Transcript.findOne({ status: 'processing' })
      .sort({ startedAt: 1 })
      .setOptions(ALL_WORKSPACES)
      .lean();
    // A file that just finished hands over to the next one straight away, so
    // Whisper isn't left idle until the following tick.
    if (current?.whisperJobId && !(await poll(current))) return;
    if (current && !current.whisperJobId) return submit(current);

    const next = await claimNext();
    if (next) await submit(next);
  } catch (err) {
    // Usually the whisper container is down or still loading; try again next tick.
    logger.warn({ err }, 'Transcript worker step failed');
  } finally {
    ticking = false;
  }
}

export function startTranscriptWorker() {
  if (!whisper.isEnabled() || timer) return;
  timer = setInterval(runTranscriptWorkerTick, POLL_INTERVAL_MS);
  timer.unref();
  logger.info('Transcript worker started');
}

export function stopTranscriptWorker() {
  clearInterval(timer);
  timer = null;
}
