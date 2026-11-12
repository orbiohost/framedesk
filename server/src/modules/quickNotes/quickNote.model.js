import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const NOTE_VISIBILITIES = ['private', 'workspace'];
export const MAX_NOTE_PROJECTS = 10;

// A quick thought or idea. Private notes are seen only by their author;
// workspace notes are shared with the whole team. Tags come from #hashtags in the body.
const quickNoteSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 160, default: null },
    body: { type: String, required: true, maxlength: 10000 },
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
  },
  { timestamps: true },
);

quickNoteSchema.plugin(workspaceScopePlugin);
quickNoteSchema.index({ workspaceId: 1, createdBy: 1, updatedAt: -1 });
quickNoteSchema.index({ workspaceId: 1, visibility: 1, updatedAt: -1 });
quickNoteSchema.index({ workspaceId: 1, projectIds: 1 });
quickNoteSchema.index({ workspaceId: 1, tags: 1 });

export const QuickNote = mongoose.model('QuickNote', quickNoteSchema);
