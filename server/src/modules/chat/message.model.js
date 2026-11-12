import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

const messageSchema = new Schema(
  {
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

messageSchema.plugin(workspaceScopePlugin);
messageSchema.index({ workspaceId: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
