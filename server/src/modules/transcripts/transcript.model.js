import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const TRANSCRIPT_STATUSES = ['queued', 'processing', 'done', 'failed'];
export const TRANSCRIPT_TASKS = ['transcribe', 'translate'];

const segmentSchema = new Schema(
  {
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    text: { type: String, required: true },
  },
  { _id: false },
);

// One transcript per audio/video file. Segments arrive while speech-to-text works, so
// people can read the start of a long video before the end is done.
const transcriptSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'File', required: true },
    status: { type: String, enum: TRANSCRIPT_STATUSES, default: 'queued' },
    // What was asked for: null = detect the spoken language.
    language: { type: String, default: null },
    // "translate" gives English text whatever language is spoken (Qwen3-ASR
    // transcribes, then the worker translates each batch of lines with Gemini).
    task: { type: String, enum: TRANSCRIPT_TASKS, default: 'transcribe' },
    detectedLanguage: { type: String, default: null },
    durationSec: { type: Number, default: null },
    progress: { type: Number, default: 0, min: 0, max: 1 },
    segments: { type: [segmentSchema], default: [] },
    // A finished transcription that was then translated to English by the AI:
    // its original lines, so "Show original" (and translating again) need no
    // new speech-to-text run.
    originalSegments: { type: [segmentSchema], default: undefined },
    // True while the AI translates originalSegments into segments. Such a
    // transcript never goes to the asr service.
    aiTranslating: { type: Boolean, default: false },
    error: { type: String, default: null },
    // The job id inside the asr container while processing.
    asrJobId: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Queued by itself for a Notes & Briefs clip: stopped when the clip turns
    // out longer than this many seconds (the uploader's limit).
    autoMaxSec: { type: Number, default: null },
    // Lines someone corrected by hand, and when (null: as transcribed).
    editedAt: { type: Date, default: null },
    editedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

transcriptSchema.plugin(workspaceScopePlugin);
transcriptSchema.index({ workspaceId: 1, fileId: 1 }, { unique: true });
// The history list: a workspace's transcripts, newest first.
transcriptSchema.index({ workspaceId: 1, _id: -1 });
// The worker picks the oldest queued transcript across all workspaces.
transcriptSchema.index({ status: 1, createdAt: 1 });

export const Transcript = mongoose.model('Transcript', transcriptSchema);
