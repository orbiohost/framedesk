import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const MEMORY_TEXT_MAX = 300;
export const MAX_MEMORIES = 150;

// One thing the assistant remembers about a person (their preferences, role,
// clients, how they like answers). Private to that person. agentId null:
// shared by all their chats; otherwise only that assistant uses it.
const aiMemorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'AiAgent', default: null },
    text: { type: String, required: true, trim: true, maxlength: MEMORY_TEXT_MAX },
    // 'auto': learnt from a chat; 'manual': typed in by the person.
    source: { type: String, enum: ['auto', 'manual'], default: 'manual' },
    threadId: { type: Schema.Types.ObjectId, ref: 'AiThread', default: null },
  },
  { timestamps: true },
);

aiMemorySchema.plugin(workspaceScopePlugin);
aiMemorySchema.index({ workspaceId: 1, userId: 1, updatedAt: -1 });

export const AiMemory = mongoose.model('AiMemory', aiMemorySchema);

// A person's AI preferences in one workspace (memory on or off).
const aiPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memoryEnabled: { type: Boolean, default: true },
    // Learn from chats automatically (costs a little usage per answer).
    autoMemory: { type: Boolean, default: true },
  },
  { timestamps: true },
);

aiPreferenceSchema.plugin(workspaceScopePlugin);
aiPreferenceSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const AiPreference = mongoose.model('AiPreference', aiPreferenceSchema);
