import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { StoredFile } from '../files/file.model.js';
import { Folder } from '../files/folder.model.js';
import { hiddenFolderIds } from '../files/folderAccess.js';
import { toFileDto } from '../files/files.service.js';
import { ensureDriveFolder } from '../files/folders.service.js';
import { Project } from '../projects/project.model.js';
import { isInBriefsFolder, markBriefStale } from '../briefs/briefStale.js';
import { AiInsight } from '../ai/aiInsight.model.js';
import { Transcript } from './transcript.model.js';
import { EXPORT_FORMATS } from './transcriptFormats.js';
import { asr } from './asrClient.js';
import { canTranslate } from './transcriptTranslate.js';

const TRANSCRIBABLE_CATEGORIES = new Set(['video', 'audio']);
// Files uploaded on the Transcribe page land in this Drive folder.
export const TRANSCRIPTIONS_FOLDER_NAME = 'Transcriptions';
const HISTORY_PAGE_SIZE = 30;
const PREVIEW_SEGMENTS = 3;
const PREVIEW_CHARS = 180;

export function isTranscribableCategory(category) {
  return TRANSCRIBABLE_CATEGORIES.has(category);
}

function toTranscriptDto(transcript) {
  return {
    id: String(transcript._id),
    fileId: String(transcript.fileId),
    status: transcript.status,
    language: transcript.language,
    task: transcript.task,
    detectedLanguage: transcript.detectedLanguage,
    durationSec: transcript.durationSec,
    progress: transcript.progress,
    segments: transcript.segments.map(({ start, end, text }) => ({ start, end, text })),
    // Translated from an earlier transcription, which can be shown again instantly.
    hasOriginal: Boolean(transcript.originalSegments?.length),
    editedAt: transcript.editedAt ?? null,
    error: transcript.error,
    requestedBy: transcript.requestedBy?.name
      ? { id: String(transcript.requestedBy._id), name: transcript.requestedBy.name }
      : null,
    createdAt: transcript.createdAt,
    finishedAt: transcript.finishedAt,
  };
}

function assertEnabled() {
  if (!asr.isEnabled()) {
    throw AppError.unavailable('Speech-to-text is not set up on this server', 'TRANSCRIPTION_OFF');
  }
}

// viewer: who is asking (see folderAccess.js). A file in a folder they can't
// open looks like it doesn't exist. Internal callers pass none.
async function findFileOrThrow(workspaceId, fileId, viewer = null) {
  const file = await StoredFile.findOne({ _id: fileId, workspaceId })
    .select('category storageKey deletedAt displayName folderId aiState aiWatchVideo')
    .lean();
  const hidden = file ? await hiddenFolderIds(workspaceId, viewer) : null;
  if (!file || hidden.has(String(file.folderId))) {
    throw AppError.notFound('File not found', 'FILE_NOT_FOUND');
  }
  return file;
}

export function getTranscriptionConfig() {
  return { enabled: asr.isEnabled() };
}

export async function getTranscript(workspaceId, fileId, viewer = null) {
  const file = await findFileOrThrow(workspaceId, fileId, viewer);
  const [transcript, insight] = await Promise.all([
    Transcript.findOne({ workspaceId, fileId }).populate('requestedBy', 'name').lean(),
    AiInsight.findOne({ workspaceId, fileId }).select('source summary').lean(),
  ]);
  if (!transcript) return null;
  return {
    ...toTranscriptDto(transcript),
    // How the AI read this clip: 'transcript' (words only), 'media', or null.
    aiReadFrom: insight?.summary ? insight.source : null,
    aiWatching: Boolean(file.aiWatchVideo) && file.aiState !== 'done',
  };
}

/**
 * Has the AI watch this video as well, not only read its transcript (shots,
 * people, on-screen text). It is read again with the video and its words.
 */
export async function watchVideo(workspaceId, fileId, viewer = null) {
  const file = await findFileOrThrow(workspaceId, fileId, viewer);
  if (file.category !== 'video') {
    throw AppError.badRequest('Only videos can be watched', 'NOT_A_VIDEO');
  }
  await StoredFile.updateOne(
    { _id: fileId, workspaceId },
    { $set: { aiWatchVideo: true, aiState: null, aiRetryAt: null, aiAttempts: 0 } },
  );
  return getTranscript(workspaceId, fileId, viewer);
}

// Queues a transcript, or starts over a finished or failed one.
export async function requestTranscript(
  workspaceId,
  fileId,
  userId,
  { language, task },
  viewer = null,
) {
  assertEnabled();
  const file = await findFileOrThrow(workspaceId, fileId, viewer);
  if (file.deletedAt) {
    throw AppError.badRequest('Restore this file before transcribing it', 'FILE_IN_TRASH');
  }
  if (!TRANSCRIBABLE_CATEGORIES.has(file.category)) {
    throw AppError.badRequest('Only video and audio files can be transcribed', 'NOT_TRANSCRIBABLE');
  }
  if (!(await reuseExistingText(workspaceId, fileId, userId, { language, task }))) {
    await queueTranscript(workspaceId, fileId, userId, { language, task });
  }
  return getTranscript(workspaceId, fileId);
}

// Switching an already transcribed file between its own language and English
// needs no new speech-to-text run (hours of CPU for a long video):
// - translate: the AI translates the existing lines (the worker does it, in batches);
// - back to the original: the lines kept from before the translation come back at once.
// Returns false when the file really has to be transcribed again.
async function reuseExistingText(workspaceId, fileId, userId, { language, task }) {
  const existing = await Transcript.findOne({
    workspaceId,
    fileId,
    status: { $in: ['done', 'failed'] },
  })
    .select('status task language detectedLanguage segments originalSegments')
    .lean();
  if (!existing) return false;
  // Another spoken language picked on purpose: the old text is likely wrong.
  if (language && language !== existing.language && language !== existing.detectedLanguage) {
    return false;
  }
  const scope = { _id: existing._id, workspaceId, status: existing.status };
  const original = existing.originalSegments?.length
    ? existing.originalSegments
    : existing.status === 'done' && existing.task === 'transcribe'
      ? existing.segments
      : null;
  if (!original?.length) return false;

  if (task === 'translate' && (existing.task === 'transcribe' || existing.status === 'failed')) {
    if (!canTranslate()) {
      throw AppError.unavailable(
        'Translation needs the AI assistant, which is not set up on this server',
        'TRANSLATION_OFF',
      );
    }
    const english = existing.detectedLanguage === 'en';
    const result = await Transcript.updateOne(scope, {
      $set: {
        task: 'translate',
        originalSegments: original,
        // Already English: nothing to translate.
        segments: english ? original : [],
        status: english ? 'done' : 'processing',
        aiTranslating: !english,
        progress: english ? 1 : 0,
        error: null,
        asrJobId: null,
        requestedBy: userId,
        startedAt: new Date(),
        finishedAt: english ? new Date() : null,
      },
    });
    return result.modifiedCount > 0;
  }

  if (task === 'transcribe' && existing.task === 'translate' && existing.originalSegments?.length) {
    const result = await Transcript.updateOne(scope, {
      $set: {
        task: 'transcribe',
        segments: existing.originalSegments,
        status: 'done',
        aiTranslating: false,
        progress: 1,
        error: null,
        requestedBy: userId,
        finishedAt: new Date(),
      },
      $unset: { originalSegments: 1 },
    });
    return result.modifiedCount > 0;
  }
  return false;
}

// Called when an upload marked "transcribe" (the Transcribe page) is stored.
// Never fails the upload: the file is kept, and the transcript can be started by hand.
export async function queueTranscriptForUpload(file, { userId, language, task }) {
  if (!asr.isEnabled() || !TRANSCRIBABLE_CATEGORIES.has(file.category)) return;
  try {
    await queueTranscript(file.workspaceId, file._id, userId, { language, task });
  } catch (err) {
    logger.warn({ err, fileId: String(file._id) }, 'Could not queue the transcript of an upload');
  }
}

async function queueTranscript(workspaceId, fileId, userId, { language, task }) {
  const fresh = {
    status: 'queued',
    language: language ?? null,
    task,
    detectedLanguage: null,
    durationSec: null,
    progress: 0,
    segments: [],
    aiTranslating: false,
    error: null,
    asrJobId: null,
    attempts: 0,
    requestedBy: userId,
    startedAt: null,
    finishedAt: null,
  };
  // Only replaces a transcript that is not being worked on right now.
  const replaced = await Transcript.findOneAndUpdate(
    { workspaceId, fileId, status: { $in: ['done', 'failed'] } },
    // A real new run: lines kept from before a translation no longer apply.
    { $set: fresh, $unset: { originalSegments: 1 } },
    { new: true },
  );
  if (!replaced) {
    try {
      await Transcript.create({ workspaceId, fileId, ...fresh });
    } catch (err) {
      if (err.code === 11000) {
        throw AppError.conflict('This file is already being transcribed', 'TRANSCRIPT_IN_PROGRESS');
      }
      throw err;
    }
  }
}

// The Drive folder the Transcribe page uploads into, created on first use.
export async function getTranscriptionsFolder(workspaceId, userId) {
  return ensureDriveFolder(workspaceId, TRANSCRIPTIONS_FOLDER_NAME, userId);
}

function previewText(segments) {
  const text = segments.map((segment) => segment.text).join(' ');
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…` : text;
}

async function namesById(Model, workspaceId, ids, field = 'name') {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const rows = await Model.find({ _id: { $in: unique }, workspaceId })
    .select(field)
    .lean();
  return new Map(rows.map((row) => [String(row._id), row[field]]));
}

// Every transcript in the workspace, newest first, without the full text: each
// row carries a short preview, the file (to open it) and where the file lives.
// Pass the returned nextCursor to get older ones.
export async function listTranscripts(workspaceId, { cursor } = {}, viewer = null) {
  const filter = { workspaceId };
  if (cursor) filter._id = { $lt: cursor };
  const transcripts = await Transcript.find(filter)
    .sort({ _id: -1 })
    .limit(HISTORY_PAGE_SIZE + 1)
    .select({ segments: { $slice: PREVIEW_SEGMENTS } })
    .populate('requestedBy', 'name')
    .lean();
  const hasMore = transcripts.length > HISTORY_PAGE_SIZE;
  const page = hasMore ? transcripts.slice(0, HISTORY_PAGE_SIZE) : transcripts;

  const files = await StoredFile.find({ _id: { $in: page.map((t) => t.fileId) }, workspaceId })
    .populate('uploadedBy', 'name')
    .lean();
  const fileById = new Map(files.map((file) => [String(file._id), file]));
  const hidden = await hiddenFolderIds(workspaceId, viewer);
  const isHidden = (transcript) => {
    const file = fileById.get(String(transcript.fileId));
    return Boolean(file) && hidden.has(String(file.folderId));
  };
  const [folderNames, projectNames] = await Promise.all([
    namesById(
      Folder,
      workspaceId,
      files.map((file) => file.folderId),
    ),
    namesById(
      Project,
      workspaceId,
      files.map((file) => file.projectId),
    ),
  ]);

  // Transcripts of files in folders the viewer can't open are left out, so a
  // page can come back shorter than the page size.
  const items = page
    .filter((transcript) => !isHidden(transcript))
    .map((transcript) => {
      const file = fileById.get(String(transcript.fileId));
      const { segments, ...dto } = toTranscriptDto(transcript);
      return {
        ...dto,
        preview: previewText(segments),
        file: file ? toFileDto(file) : null,
        location: file
          ? {
              projectId: file.projectId ? String(file.projectId) : null,
              projectName: file.projectId
                ? (projectNames.get(String(file.projectId)) ?? null)
                : null,
              folderId: String(file.folderId),
              folderName: folderNames.get(String(file.folderId)) ?? null,
            }
          : null,
      };
    });
  return { transcripts: items, nextCursor: hasMore ? String(page.at(-1)._id) : null };
}

async function cancelRunningJobs(transcripts) {
  await Promise.all(
    transcripts
      .filter((transcript) => transcript.status === 'processing' && transcript.asrJobId)
      .map((transcript) =>
        asr
          .cancelJob(transcript.asrJobId)
          .catch((err) => logger.warn({ err }, 'Could not cancel a speech-to-text job')),
      ),
  );
}

export async function deleteTranscript(workspaceId, fileId, viewer = null) {
  await findFileOrThrow(workspaceId, fileId, viewer);
  const transcript = await Transcript.findOneAndDelete({ workspaceId, fileId }).lean();
  if (transcript) await cancelRunningJobs([transcript]);
}

// Called when files are deleted for good (one file, a project, a workspace).
export async function deleteTranscriptsForFiles(workspaceId, fileIds) {
  if (fileIds.length === 0) return;
  const filter = { workspaceId, fileId: { $in: fileIds } };
  const transcripts = await Transcript.find(filter).select('status asrJobId').lean();
  if (transcripts.length === 0) return;
  await Transcript.deleteMany(filter);
  await cancelRunningJobs(transcripts);
}

function baseName(displayName) {
  return displayName.replace(/\.[^.]+$/, '') || 'transcript';
}

export async function exportTranscript(workspaceId, fileId, format, viewer = null) {
  const file = await findFileOrThrow(workspaceId, fileId, viewer);
  const transcript = await Transcript.findOne({ workspaceId, fileId }).lean();
  if (!transcript || transcript.segments.length === 0) {
    throw AppError.notFound('This file has no transcript yet', 'TRANSCRIPT_NOT_FOUND');
  }
  const { mime, render } = EXPORT_FORMATS[format];
  return {
    fileName: `${baseName(file.displayName)}.${format}`,
    mime,
    content: render(transcript.segments),
  };
}

export async function transcribeDictation(audio, { mime, language }) {
  assertEnabled();
  if (!audio?.length) throw AppError.badRequest('The recording is empty', 'EMPTY_RECORDING');
  return asr.transcribeClip(audio, { mime, language });
}

// After a hand correction the AI reads a Notes & Briefs clip again, so the
// brief uses the fixed words. Each new edit pushes it back a little, so a
// run of corrections costs one re-read.
const REREAD_AFTER_EDIT_MS = 2 * 60 * 1000;

/**
 * Replaces the text of some lines of a finished transcript (spelling, names).
 * edits: [{ index, text }]. Timings stay as they are.
 */
export async function editSegments(workspaceId, fileId, userId, edits, viewer = null) {
  const file = await findFileOrThrow(workspaceId, fileId, viewer);
  const transcript = await Transcript.findOne({ workspaceId, fileId })
    .select('status segments')
    .lean();
  if (!transcript)
    throw AppError.notFound('This file has no transcript yet', 'TRANSCRIPT_NOT_FOUND');
  if (transcript.status !== 'done') {
    throw AppError.conflict('Wait until the transcript is finished to edit it', 'TRANSCRIPT_BUSY');
  }
  const set = { editedAt: new Date(), editedBy: userId };
  for (const { index, text } of edits) {
    if (index >= transcript.segments.length) {
      throw AppError.badRequest('That line does not exist', 'SEGMENT_NOT_FOUND');
    }
    set[`segments.${index}.text`] = text;
  }
  const result = await Transcript.updateOne(
    { _id: transcript._id, workspaceId, status: 'done' },
    { $set: set },
  );
  if (!result.matchedCount) {
    throw AppError.conflict('The transcript changed meanwhile, reload it', 'TRANSCRIPT_BUSY');
  }

  if (await isInBriefsFolder(workspaceId, file.folderId)) {
    await StoredFile.updateOne(
      { _id: fileId, workspaceId, aiState: { $in: ['done', 'skipped', 'failed', null] } },
      {
        $set: {
          aiState: null,
          aiAttempts: 0,
          aiRetryAt: new Date(Date.now() + REREAD_AFTER_EDIT_MS),
        },
      },
    );
    await markBriefStale(workspaceId, file.folderId);
  }
  return getTranscript(workspaceId, fileId);
}
