// How far along a brief that is being made is, as a percentage.
//
// A brief goes through three stages, one after another:
//   1. reading  — the analysis worker reads each new file on its own,
//   2. waiting  — the brief worker waits BRIEF_DEBOUNCE_MS after the last
//                 change (so a batch of uploads makes one brief),
//   3. writing  — one AI call writes the brief from everything.
// Each stage is weighted by how long it is expected to take, so the
// percentage moves at a steady pace instead of jumping between stages. The
// file counts are exact; times come from the file sizes and from how long
// this project's last brief actually took to write.

const ANALYSABLE = new Set(['video', 'audio', 'image', 'document']);
const PENDING = new Set([null, 'processing']);
const MB = 1024 * 1024;
// The brief worker checks every 10 s, so on average 5 s pass after the wait.
const TICK_SLACK_S = 5;

// Rough seconds the analysis worker needs for one file.
function readSecondsFor(file) {
  const mb = (file.size ?? 0) / MB;
  switch (file.category) {
    case 'image':
      return 15;
    case 'document':
      return Math.min(120, 20 + mb * 2);
    case 'audio':
      return Math.min(240, 20 + mb * 2);
    case 'video':
      return Math.min(300, 30 + mb * 0.4);
    default:
      return 20;
  }
}

const TRANSCRIBING = new Set(['queued', 'processing']);
// Reading a finished transcript is one quick text-only AI call.
const TEXT_READ_S = 15;
// Local speech-to-text (Qwen3-ASR on CPU, ~2.5x real time with the aligner):
// seconds of work per second of audio, until a running
// job shows its real speed.
const ASR_REALTIME_FACTOR = 2.5;

// Seconds of speech in a clip: measured, or guessed from its size.
function clipSeconds(file, transcript) {
  const known = transcript?.durationSec ?? file.mediaDurationSec;
  if (known) return known;
  const mb = (file.size ?? 0) / MB;
  return file.category === 'audio' ? mb * 60 : mb * 8;
}

// { total, done } seconds of speech-to-text for one clip. A running job's
// speed so far (elapsed / progress) gives its real total.
function transcribeWork(file, transcript, now) {
  if (!TRANSCRIBING.has(transcript.status)) {
    const total = Math.max(10, clipSeconds(file, transcript) * ASR_REALTIME_FACTOR);
    return { total, done: total };
  }
  const guess = Math.max(10, clipSeconds(file, transcript) * ASR_REALTIME_FACTOR);
  if (transcript.status === 'queued') return { total: guess, done: 0 };
  const elapsed = Math.max(0, seconds(transcript.startedAt, now));
  const progress = transcript.progress ?? 0;
  if (progress >= 0.03 && elapsed > 5) {
    const total = elapsed / progress;
    return { total, done: elapsed };
  }
  return { total: guess, done: guess * Math.min(0.5, partial(elapsed, guess)) };
}

function writeSecondsFor(brief, fileCount) {
  if (brief?.writeMs > 0) return Math.max(10, brief.writeMs / 1000);
  return Math.min(180, 25 + fileCount * 2);
}

// 0..1 for something expected to take `expected` seconds, `elapsed` in. Linear
// up to 90 %, then it slows down and never reaches 100 % until it is done.
function partial(elapsed, expected) {
  const f = Math.max(0, elapsed) / Math.max(1, expected);
  if (f <= 0.9) return f;
  return 0.9 + 0.09 * (1 - Math.exp(-(f - 0.9) * 3));
}

function seconds(from, to) {
  return from ? (new Date(to).getTime() - new Date(from).getTime()) / 1000 : 0;
}

/**
 * files: the folder's files (category, size, aiState, aiRetryAt, updatedAt,
 * mediaDurationSec) with `transcript` ({ status, progress, startedAt,
 * finishedAt, durationSec }) on clips that have one.
 * Returns { percent, stage, etaSeconds, startedAt } while the brief is being
 * made, or nulls when it is not.
 */
export function briefPercent(brief, files, debounceMs, now = new Date()) {
  const idle = { percent: null, stage: null, etaSeconds: null, startedAt: null };
  const status = brief?.status ?? (files.length ? 'queued' : 'empty');
  if (!['queued', 'waiting', 'generating'].includes(status)) return idle;

  const startedAt = brief?.runStartedAt ?? brief?.staleSince ?? now;
  // The files this run has to read: still unread, or read since it started.
  const toRead = files.filter(
    (file) =>
      ANALYSABLE.has(file.category) &&
      (PENDING.has(file.aiState) || new Date(file.updatedAt) >= new Date(startedAt)),
  );

  // A transcript written during this update counts towards it.
  const inRun = (transcript) =>
    transcript.finishedAt && new Date(transcript.finishedAt) >= new Date(startedAt);
  let readTotal = 0;
  let readDone = 0;
  let transcribing = false;
  for (const file of toRead) {
    const transcript = file.transcript;
    const clipWork = transcript && (TRANSCRIBING.has(transcript.status) || inRun(transcript));
    // A clip with a transcript is read from its words: quick once it's written.
    const expected = clipWork ? TEXT_READ_S : readSecondsFor(file);
    readTotal += expected;
    if (!PENDING.has(file.aiState)) readDone += expected;
    else if (file.aiState === 'processing') {
      readDone += expected * Math.min(0.95, partial(seconds(file.aiRetryAt, now), expected));
    }
    if (clipWork) {
      const { total, done } = transcribeWork(file, transcript, now);
      readTotal += total;
      readDone += done;
      if (TRANSCRIBING.has(transcript.status)) transcribing = true;
    }
  }
  const reading = toRead.some((file) => PENDING.has(file.aiState));

  // The wait after the last change (or until a retry is due).
  const waitTotal = debounceMs / 1000 + TICK_SLACK_S;
  let waitDone = 0;
  if (status === 'generating') waitDone = waitTotal;
  else if (!reading) {
    const dueAt = Math.max(
      new Date(brief?.staleSince ?? now).getTime() + debounceMs,
      brief?.retryAt ? new Date(brief.retryAt).getTime() : 0,
    );
    const left = Math.max(0, (dueAt - now.getTime()) / 1000) + TICK_SLACK_S;
    waitDone = Math.max(0, waitTotal - left);
  }

  const writeTotal = writeSecondsFor(brief, files.length);
  const writeDone =
    status === 'generating' && !reading
      ? writeTotal * partial(seconds(brief?.claimedAt, now), writeTotal)
      : 0;

  const total = readTotal + waitTotal + writeTotal;
  const done = readDone + waitDone + writeDone;
  let stage = 'writing';
  if (transcribing) stage = 'transcribing';
  else if (reading) stage = 'reading';
  else if (status !== 'generating') stage = 'waiting';

  return {
    percent: Math.max(1, Math.min(99, Math.floor((done / total) * 100))),
    stage,
    etaSeconds: Math.max(1, Math.round(total - done)),
    startedAt: new Date(startedAt).toISOString(),
  };
}
