import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

// One private scratch note per person per workspace.
const noteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, maxlength: 5000, default: '' },
  },
  { timestamps: true },
);

noteSchema.plugin(workspaceScopePlugin);
noteSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const Note = mongoose.model('Note', noteSchema);
