import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const MAX_STORED_MESSAGES = 100;

const messageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'model'], required: true },
    text: { type: String, required: true, maxlength: 20_000 },
    // Files the answer pointed to, so the chat can open them.
    fileIds: { type: [Schema.Types.ObjectId], default: [] },
    credits: { type: Number, default: 0 },
    // The project a question was limited to with "/" (kept for the chip in the chat).
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    projectTitle: { type: String, default: null, maxlength: 160 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

// One running chat per person per workspace. Private to that person.
const aiConversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true },
);

aiConversationSchema.plugin(workspaceScopePlugin);
aiConversationSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const AiConversation = mongoose.model('AiConversation', aiConversationSchema);
