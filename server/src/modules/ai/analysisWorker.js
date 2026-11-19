import { getStorageDriver } from '../../storage/storageDriver.js';
import { logger } from '../../utils/logger.js';
import { markBriefStale } from '../briefs/briefStale.js';
import { isClip } from '../briefs/briefTranscribe.js';
import { StoredFile } from '../files/file.model.js';
import { correctedMime } from '../files/fileTypes.js';
import { Folder } from '../files/folder.model.js';
import { briefsRootOf } from '../files/folders.service.js';
import { Project } from '../projects/project.model.js';
import { asr } from '../transcripts/asrClient.js';
import { Transcript } from '../transcripts/transcript.model.js';
import { findPoolWorkspace } from '../workspaces/storagePool.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { AiInsight } from './aiInsight.model.js';
import { getAiSettings, isAiLive } from './aiSettings.service.js';
import { transcriptText, truncate } from './aiText.js';
import { creditBalance, creditsForTokens, spendCredits } from './credits.service.js';
import { deleteFile, GeminiError, generateContent, uploadFile } from './gemini.client.js';

// Looks at every uploaded video, audio file, image and document once, in the
// background, and keeps what Gemini saw (AiInsight). The chat answers from
// those notes, so asking a question never re-sends gigabytes of video.
//
// The queue is the file's aiState (null = not looked at yet). Claiming is an
// atomic update, so a second API instance would simply take another file.

const TICK_MS = 5000;
const ALL = { crossWorkspace: true };
const ANALYSABLE_CATEGORIES = ['video', 'audio', 'image', 'document'];
const MAX_ATTEMPTS = 4;
// A worker that died mid-file leaves it "processing"; after this it is retried.
const STALE_MS = 90 * 60 * 1000;
// Accounts that ran out are checked again now and then (the allowance refills monthly).
const NO_CREDITS_RECHECK_MS = 6 * 60 * 60 * 1000;
const HOUSEKEEPING_MS = 10 * 60 * 1000;
const INLINE_IMAGE_BYTES = 15 * 1024 * 1024;
const TEXT_BYTES = 300 * 1024;
const TRANSCRIPT_CHARS = 200_000;
// A Notes & Briefs clip waits this long at most for its transcript (a long
// speech-to-text queue), then the AI reads the media itself.
const TRANSCRIPT_WAIT_MS = 6 * 60 * 60 * 1000;
// ...and this long for the decision whether to transcribe it at all.
const DECISION_WAIT_MS = 10 * 60 * 1000;
const RECHECK_MS = 60 * 1000;

// What Gemini accepts, keyed by the mime we store.
// https://ai.google.dev/gemini-api/docs/video-understanding (and audio, image, document pages)
const GEMINI_MIME = {
  'video/mp4': 'video/mp4',
  'video/x-m4v': 'video/mp4',
  'video/mpeg': 'video/mpeg',
  'video/quicktime': 'video/mov',
  'video/x-msvideo': 'video/avi',
  'video/x-flv': 'video/x-flv',
  'video/webm': 'video/webm',
  'video/x-ms-wmv': 'video/wmv',
  'video/3gpp': 'video/3gpp',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/mpeg': 'audio/mp3',
  'audio/mp3': 'audio/mp3',
  'audio/aiff': 'audio/aiff',
  'audio/x-aiff': 'audio/aiff',
  'audio/aac': 'audio/aac',
  'audio/ogg': 'audio/ogg',
  'audio/flac': 'audio/flac',
  'audio/x-flac': 'audio/flac',
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/webp': 'image/webp',
  'image/heic': 'image/heic',
  'image/heif': 'image/heif',
  'application/pdf': 'application/pdf',
};
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'srt', 'vtt']);

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    details: { type: 'STRING' },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    language: { type: 'STRING', nullable: true },
    moments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { at: { type: 'STRING' }, text: { type: 'STRING' } },
        required: ['at', 'text'],
      },
    },
  },
  required: ['summary', 'details', 'tags', 'moments'],
};

const SYSTEM = `You catalogue files for a video production studio's file library, so a teammate can later find and ask about them without opening them.
Describe only what is really in the file. Never invent names, brands or facts you cannot see or hear.
Write in English, but keep quotes, on-screen text and names in their original language.`;

function instructionsFor(category) {
  const common = `Return JSON with:
- summary: 2-4 sentences on what this file is.
- details: a thorough description (up to ~400 words)`;
  if (category === 'video') {
    return `${common}: setting, people (by role or appearance, or by name if shown or spoken), actions, shot types and camera work, on-screen text and graphics, brands or logos, what is said (gist), music and mood, and anything useful to an editor (b-roll, interview, product shot, quality issues).
- moments: up to 20 notable moments with "at" as m:ss timestamps.
- tags: 5-15 short lowercase keywords.
- language: the main spoken language, or null.`;
  }
  if (category === 'audio') {
    return `${common}: who speaks (roles), topics discussed, key statements, music or sound design, recording quality.
- moments: up to 20 notable moments with "at" as m:ss timestamps.
- tags: 5-15 short lowercase keywords.
- language: the main spoken language, or null.`;
  }
  if (category === 'image') {
    return `${common}: subject, composition, people, setting, colours and mood, any text in the image (verbatim), brands, and what it could be used for.
- moments: an empty list.
- tags: 5-15 short lowercase keywords.
- language: the language of any text, or null.`;
  }
  return `${common}: purpose of the document, key points, names, dates, amounts, deadlines, action items, and the structure.
- moments: up to 20 key points with "at" as the page number or section (e.g. "p. 3").
- tags: 5-15 short lowercase keywords.
- language: the document's language, or null.`;
}

// Files in a project's "Notes & Briefs" folder are meeting material: what
// matters is every word written or said, so the project brief can be built
// from it (see briefs/briefWorker.js).
function briefsInstructionsFor(category) {
  const common = `This file was put in the project's "Notes & Briefs" folder, so it is meeting material: notes, a voice note, a recording or a reference. Return JSON with:
- summary: 2-4 sentences: what this is (e.g. "Handwritten notes from the client kickoff on 12 Nov") and its main points.`;
  if (category === 'image') {
    return `${common}
- details: transcribe ALL legible writing verbatim, keeping its structure (headings, bullets, numbering, arrows as "→", underlines as **bold**). Mark words you cannot read as [illegible] (or [unclear: best guess]). Then briefly describe any sketches, diagrams or layouts and what they show. If it is a photo of a whiteboard, screen or printed page, do the same. Up to ~1500 words.
- moments: an empty list.
- tags: 5-15 short lowercase keywords (topics, names, dates).
- language: the language of the writing, or null.`;
  }
  if (category === 'audio' || category === 'video') {
    return `${common}
- details: a faithful, thorough write-up of what is said, in order: who speaks (by name if said, else by role), each topic, every decision, every action item with who will do it and by when, numbers, dates, names, and questions left open. Keep important statements close to word for word. Up to ~1500 words.
- moments: up to 25 key moments (decisions, action items, topic changes) with "at" as m:ss timestamps.
- tags: 5-15 short lowercase keywords (topics, names, dates).
- language: the main spoken language, or null.`;
  }
  return `${common}
- details: the full substance faithfully: agenda, discussion, decisions, action items with owners and dates, names, amounts, deadlines and open questions, keeping the document's structure. Up to ~1500 words.
- moments: up to 20 key points with "at" as the page number or section (e.g. "p. 3").
- tags: 5-15 short lowercase keywords.
- language: the document's language, or null.`;
}

let timer = null;
let ticking = false;
let pausedUntil = 0;
let lastHousekeeping = 0;

async function setState(file, state, extra = {}) {
  await StoredFile.updateOne(
    { _id: file._id, workspaceId: file.workspaceId },
    { $set: { aiState: state, ...extra } },
  );
}

// Whether a clip with a finished transcript is read from its words rather
// than sent whole to the AI: always for audio and meeting material; for other
// video unless its project, or someone for this one file, asked to watch it.
function readsFromTranscript(file, project, meetingMaterial) {
  if (file.category === 'audio' || meetingMaterial) return true;
  if (file.category !== 'video') return false;
  return !file.aiWatchVideo && project?.aiClipSource !== 'video';
}

async function contextFor(file) {
  const [folder, project, transcript, briefsRoot] = await Promise.all([
    Folder.findOne({ _id: file.folderId, workspaceId: file.workspaceId }).select('name').lean(),
    file.projectId
      ? Project.findOne({ _id: file.projectId, workspaceId: file.workspaceId })
          .select('title aiClipSource')
          .lean()
      : null,
    Transcript.findOne({ workspaceId: file.workspaceId, fileId: file._id })
      .select('segments status createdAt')
      .lean(),
    briefsRootOf(file.workspaceId, file.folderId).catch(() => null),
  ]);
  const lines = [`File name: ${file.displayName}`];
  if (project) lines.push(`Project: ${project.title}`);
  if (folder) lines.push(`Folder: ${folder.name}`);
  if (file.note) lines.push(`Team note: ${truncate(file.note, 1000)}`);
  if (file.tags?.length) lines.push(`Team tags: ${file.tags.join(', ')}`);
  return {
    header: lines.join('\n'),
    transcript: transcript?.status === 'done' ? transcript : null,
    transcriptPending: ['queued', 'processing'].includes(transcript?.status),
    transcriptQueuedAt: transcript?.createdAt ?? null,
    hasTranscriptRow: Boolean(transcript),
    meetingMaterial: Boolean(briefsRoot),
    readFromTranscript: readsFromTranscript(file, project, Boolean(briefsRoot)),
  };
}

async function readText(file) {
  const bytes = Math.min(file.size, TEXT_BYTES);
  if (bytes === 0) return '';
  const buffer = await getStorageDriver().readStart(file.storageKey, bytes);
  return buffer.toString('utf8');
}

async function readAll(file) {
  const chunks = [];
  for await (const chunk of getStorageDriver().readStream(file.storageKey)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Decides how Gemini gets to see a file. Returns { parts, source, upload?, mediaResolution? }
 * or { skip: reason }.
 */
async function inputFor(file, settings, context) {
  const mime = correctedMime(file.mime, file.extension);
  const geminiMime = GEMINI_MIME[mime];
  const maxBytes = settings.maxAnalysisMB * 1024 * 1024;

  // A clip speech-to-text already wrote out: the AI reads the words instead of
  // listening to it again. Much faster and a fraction of the credits.
  if (context.readFromTranscript && context.transcript?.segments?.length) {
    const kind = file.category === 'video' ? 'recording' : 'audio';
    return {
      source: 'transcript',
      parts: [
        {
          text: `Transcript of this ${kind} (local speech-to-text, with timestamps):\n${transcriptText(context.transcript.segments, TRANSCRIPT_CHARS)}`,
        },
      ],
    };
  }

  if (TEXT_EXTENSIONS.has(file.extension)) {
    const text = await readText(file);
    if (!text.trim()) return { skip: 'The file is empty' };
    return { source: 'text', parts: [{ text: `File contents:\n${text}` }] };
  }

  if (geminiMime && file.size <= maxBytes) {
    if (file.category === 'image' && file.size <= INLINE_IMAGE_BYTES) {
      const data = (await readAll(file)).toString('base64');
      return { source: 'media', parts: [{ inlineData: { mimeType: geminiMime, data } }] };
    }
    const uploaded = await uploadFile({
      stream: getStorageDriver().readStream(file.storageKey),
      size: file.size,
      mimeType: geminiMime,
      displayName: file.displayName,
    });
    return {
      source: 'media',
      upload: uploaded,
      parts: [{ fileData: { mimeType: uploaded.mimeType, fileUri: uploaded.uri } }],
      mediaResolution: file.category === 'video' ? 'MEDIA_RESOLUTION_LOW' : undefined,
    };
  }

  // Too big, or a format Gemini can't open (MKV, ProRes MXF, RAW...): its
  // transcript still tells what is said.
  if (context.transcript?.segments?.length) {
    return {
      source: 'transcript',
      parts: [
        {
          text: `Gemini cannot open this file directly, so here is its transcript:\n${transcriptText(context.transcript.segments, TRANSCRIPT_CHARS)}`,
        },
      ],
    };
  }
  if (!geminiMime) return { skip: 'This format cannot be analysed yet' };
  return { skip: `Larger than ${settings.maxAnalysisMB} MB` };
}

function parseResult(text) {
  try {
    const data = JSON.parse(text);
    return {
      summary: truncate(String(data.summary ?? ''), 2000),
      details: truncate(String(data.details ?? ''), 12_000),
      tags: (Array.isArray(data.tags) ? data.tags : [])
        .map((tag) => String(tag).trim().toLowerCase().slice(0, 40))
        .filter(Boolean)
        .slice(0, 20),
      moments: (Array.isArray(data.moments) ? data.moments : []).slice(0, 30).map((moment) => ({
        at: truncate(String(moment.at ?? ''), 20),
        text: truncate(String(moment.text ?? ''), 400),
      })),
      language: data.language ? String(data.language).slice(0, 40) : null,
    };
  } catch {
    // Not JSON after all: keep the text as the description.
    return { summary: truncate(text, 500), details: truncate(text, 12_000), tags: [], moments: [] };
  }
}

// A clip that is being transcribed right now (and will be read from its
// words) waits for the transcript instead of being sent whole to the AI.
function shouldWaitForTranscript(file, context) {
  if (!isClip(file) || !asr.isEnabled() || !context.readFromTranscript) return false;
  const age = Date.now() - new Date(file.createdAt).getTime();
  if (context.transcriptPending) {
    const since = context.transcriptQueuedAt ?? file.createdAt;
    return Date.now() - new Date(since).getTime() < TRANSCRIPT_WAIT_MS;
  }
  if (!context.meetingMaterial) return false;
  // Not decided yet whether it gets transcribed (briefs/briefTranscribe.js).
  return !context.hasTranscriptRow && !file.autoTranscribe && age < DECISION_WAIT_MS;
}

// askedBy: who the credits are charged to (the person asking, or the uploader).
async function analyse(file, settings, askedBy = null) {
  const workspace = await Workspace.findById(file.workspaceId).lean();
  if (!workspace) return setState(file, 'skipped');
  const pool = await findPoolWorkspace(workspace);
  const minimum = Math.max(1, settings.minAnalysisCredits);
  if (pool.ai?.blocked || creditBalance(pool, settings).total < minimum) {
    return setState(file, 'no_credits', { aiRetryAt: new Date() });
  }

  const context = await contextFor(file);
  if (shouldWaitForTranscript(file, context)) {
    // Not an attempt: checked again shortly, or woken when the transcript is done.
    return setState(file, null, { aiRetryAt: new Date(Date.now() + RECHECK_MS) });
  }
  const input = await inputFor(file, settings, context);
  // Watching a video that has a transcript: the exact words help too.
  if (input.source === 'media' && isClip(file) && context.transcript?.segments?.length) {
    input.parts.push({
      text: `Its transcript (local speech-to-text, with timestamps):
${transcriptText(context.transcript.segments, TRANSCRIPT_CHARS)}`,
    });
  }
  if (input.skip) {
    await AiInsight.updateOne(
      { workspaceId: file.workspaceId, fileId: file._id },
      { $set: { note: input.skip, summary: '', details: '' } },
      { upsert: true },
    );
    await setState(file, 'skipped', { aiAttempts: 0 });
    return markBriefStale(file.workspaceId, file.folderId);
  }

  let result;
  try {
    result = await generateContent({
      model: settings.model,
      system: SYSTEM,
      contents: [
        {
          role: 'user',
          parts: [
            ...input.parts,
            {
              text: `${context.header}\n\n${
                context.meetingMaterial
                  ? briefsInstructionsFor(file.category)
                  : instructionsFor(file.category)
              }`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
        ...(input.mediaResolution && { mediaResolution: input.mediaResolution }),
      },
    });
  } finally {
    if (input.upload) await deleteFile(input.upload.name);
  }

  const parsed = parseResult(result.text);
  const credits = creditsForTokens(result.totalTokens, settings, settings.minAnalysisCredits);
  const { spent } = await spendCredits(pool._id, credits, {
    kind: 'analysis',
    usedInWorkspaceId: file.workspaceId,
    fileId: file._id,
    userId: askedBy ?? file.uploadedBy,
    tokens: result.totalTokens,
  });
  await AiInsight.updateOne(
    { workspaceId: file.workspaceId, fileId: file._id },
    {
      $set: {
        ...parsed,
        source: input.source,
        model: result.model,
        tokens: result.totalTokens,
        credits: spent,
        note: null,
      },
    },
    { upsert: true },
  );
  await setState(file, 'done', { aiAttempts: 0, aiRetryAt: null });
  await markBriefStale(file.workspaceId, file.folderId);
}

async function retryLater(file, error) {
  const attempts = (file.aiAttempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS || (error instanceof GeminiError && !error.transient)) {
    await AiInsight.updateOne(
      { workspaceId: file.workspaceId, fileId: file._id },
      { $set: { note: truncate(error.message, 300) } },
      { upsert: true },
    );
    await setState(file, 'failed', { aiAttempts: attempts });
    return markBriefStale(file.workspaceId, file.folderId);
  }
  const delayMs = 5 * 60 * 1000 * 2 ** (attempts - 1);
  await setState(file, null, { aiAttempts: attempts, aiRetryAt: new Date(Date.now() + delayMs) });
}

async function housekeeping(now) {
  if (now - lastHousekeeping < HOUSEKEEPING_MS) return;
  lastHousekeeping = now;
  await StoredFile.updateMany(
    { aiState: 'processing', aiRetryAt: { $lt: new Date(now - STALE_MS) } },
    { $set: { aiState: null, aiRetryAt: null } },
  ).setOptions(ALL);
  await StoredFile.updateMany(
    { aiState: 'no_credits', aiRetryAt: { $lt: new Date(now - NO_CREDITS_RECHECK_MS) } },
    { $set: { aiState: null, aiRetryAt: null } },
  ).setOptions(ALL);
}

function claimNext(now) {
  return StoredFile.findOneAndUpdate(
    {
      aiState: null,
      deletedAt: null,
      category: { $in: ANALYSABLE_CATEGORIES },
      aiRetryAt: { $not: { $gt: now } },
    },
    { $set: { aiState: 'processing', aiRetryAt: now } },
    { sort: { _id: -1 }, new: true },
  )
    .setOptions(ALL)
    .lean();
}

export async function runAnalysisTick() {
  if (ticking || Date.now() < pausedUntil) return;
  ticking = true;
  let file = null;
  try {
    const settings = await getAiSettings();
    if (!isAiLive(settings)) return;
    const now = new Date();
    await housekeeping(now.getTime());
    // With background analysis off, files are analysed when asked about (analyseOnDemand).
    if (!settings.autoAnalyze) return;
    file = await claimNext(now);
    if (!file) return;
    await analyse(file, settings);
  } catch (error) {
    if (error instanceof GeminiError && error.status === 429) pausedUntil = Date.now() + 60_000;
    logger.warn({ err: error.message, fileId: file && String(file._id) }, 'AI analysis failed');
    if (file) await retryLater(file, error).catch(() => {});
  } finally {
    ticking = false;
  }
}

const ON_DEMAND_STATES = [null, 'no_credits'];

/**
 * Analyses these files now, for a question someone just asked, charging that
 * person's account. Waits at most waitMs: a long video keeps going in the
 * background and is ready for the next question. Returns the ids finished in time.
 */
export async function analyseOnDemand(files, settings, { askedBy, waitMs }) {
  const now = new Date();
  const claimed = [];
  for (const candidate of files) {
    const file = await StoredFile.findOneAndUpdate(
      {
        _id: candidate._id,
        workspaceId: candidate.workspaceId,
        deletedAt: null,
        category: { $in: ANALYSABLE_CATEGORIES },
        aiState: { $in: ON_DEMAND_STATES },
        aiRetryAt: { $not: { $gt: now } },
      },
      { $set: { aiState: 'processing', aiRetryAt: now } },
      { new: true },
    ).lean();
    if (file) claimed.push(file);
  }
  if (claimed.length === 0) return new Set();

  const done = new Set();
  const runs = claimed.map((file) =>
    analyse(file, settings, askedBy)
      .then(() => done.add(String(file._id)))
      .catch(async (error) => {
        logger.warn({ err: error.message, fileId: String(file._id) }, 'AI analysis failed');
        await retryLater(file, error).catch(() => {});
      }),
  );
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  await Promise.race([Promise.all(runs), timeout]);
  clearTimeout(timer);
  return done;
}

export function startAnalysisWorker() {
  if (timer) return;
  timer = setInterval(runAnalysisTick, TICK_MS);
  timer.unref();
  logger.info('AI analysis worker started');
}

export function stopAnalysisWorker() {
  clearInterval(timer);
  timer = null;
}

// Queues a file to be looked at again (e.g. its transcript just finished).
export async function requeueForAnalysis(workspaceId, fileId, fromStates = ['skipped', 'failed']) {
  await StoredFile.updateOne(
    { _id: fileId, workspaceId, aiState: { $in: fromStates } },
    { $set: { aiState: null, aiRetryAt: null, aiAttempts: 0 } },
  );
}
