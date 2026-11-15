import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

// empty: nothing in the folder yet. waiting: files are still being read.
// queued: something changed, a new brief is due. generating: being written.
// ready: up to date. failed / no_credits: the last try didn't work.
export const BRIEF_STATUSES = [
  'empty',
  'waiting',
  'queued',
  'generating',
  'ready',
  'failed',
  'no_credits',
];

const actionItemSchema = new Schema(
  {
    text: { type: String, trim: true, maxlength: 500 },
    owner: { type: String, trim: true, maxlength: 120, default: null },
    due: { type: String, trim: true, maxlength: 60, default: null },
    fileIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: true },
);

const meetingSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 200 },
    date: { type: String, trim: true, maxlength: 60, default: null },
    attendees: { type: [String], default: [] },
    summary: { type: String, trim: true, maxlength: 3000 },
    decisions: { type: [String], default: [] },
    fileIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: false },
);

const pointSchema = new Schema(
  {
    text: { type: String, trim: true, maxlength: 800 },
    fileIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: false },
);

// What the AI made of everything in a project's "Notes & Briefs" folder:
// handwritten pages, voice notes, recordings and documents, read together.
// One per project; rewritten whenever the folder changes.
const projectBriefSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder', required: true },
    status: { type: String, enum: BRIEF_STATUSES, default: 'queued' },
    // When the folder last changed. The worker waits a little after this, so a
    // batch of uploads makes one brief rather than one per file.
    staleSince: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    retryAt: { type: Date, default: null },
    error: { type: String, default: null, maxlength: 300 },

    title: { type: String, default: '', maxlength: 200 },
    overview: { type: String, default: '', maxlength: 4000 },
    keyPoints: { type: [pointSchema], default: [] },
    decisions: { type: [pointSchema], default: [] },
    actionItems: { type: [actionItemSchema], default: [] },
    openQuestions: { type: [pointSchema], default: [] },
    meetings: { type: [meetingSchema], default: [] },
    // The full write-up as Markdown, with [[file:<id>]] citations.
    notes: { type: String, default: '', maxlength: 40_000 },

    // What the brief was written from: file ids with their analysis times, so
    // an unchanged folder is never paid for twice.
    signature: { type: String, default: null },
    sourceFileIds: { type: [Schema.Types.ObjectId], default: [] },
    generatedAt: { type: Date, default: null },
    model: { type: String, default: null },
    tokens: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    // Ids of action items already turned into tasks.
    tasksCreatedFor: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

projectBriefSchema.plugin(workspaceScopePlugin);
projectBriefSchema.index({ workspaceId: 1, projectId: 1 }, { unique: true });
// The worker's queue, across workspaces.
projectBriefSchema.index({ staleSince: 1 });

export const ProjectBrief = mongoose.model('ProjectBrief', projectBriefSchema);
