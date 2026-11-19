import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const NOTE_VISIBILITIES = ['private', 'workspace'];
export const MAX_NOTE_PROJECTS = 10;

// A quick thought or idea. Private notes are seen only by their author;
// workspace notes are shared with the whole team. Tags come from #hashtags in the body.
const quickNoteSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 160, default: null },
    // A note needs a title or some text; a title on its own is fine.
    body: { type: String, maxlength: 10000, default: '' },
    projectIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
      default: [],
      validate: [
        (list) => list.length <= MAX_NOTE_PROJECTS,
        `Link at most ${MAX_NOTE_PROJECTS} projects`,
      ],
    },
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    visibility: { type: String, enum: NOTE_VISIBILITIES, default: 'private' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Set when the note is an AI answer saved from a chat, so it can link back.
    // Only the server sets this (never from a request body).
    source: {
      type: new Schema(
        {
          kind: { type: String, enum: ['ai'], required: true },
          threadId: { type: Schema.Types.ObjectId, ref: 'AiThread', required: true },
          messageId: { type: Schema.Types.ObjectId, required: true },
          // The question that was answered, kept in case the chat is deleted.
          question: { type: String, maxlength: 500, default: null },
          fileIds: { type: [Schema.Types.ObjectId], default: [] },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

quickNoteSchema.plugin(workspaceScopePlugin);
quickNoteSchema.index({ workspaceId: 1, createdBy: 1, updatedAt: -1 });
quickNoteSchema.index({ workspaceId: 1, visibility: 1, updatedAt: -1 });
quickNoteSchema.index({ workspaceId: 1, projectIds: 1 });
quickNoteSchema.index({ workspaceId: 1, tags: 1 });
// Only notes saved from an AI chat are in this index.
quickNoteSchema.index(
  { workspaceId: 1, createdBy: 1, 'source.threadId': 1 },
  { partialFilterExpression: { 'source.threadId': { $type: 'objectId' } } },
);

export const QuickNote = mongoose.model('QuickNote', quickNoteSchema);
