import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const AGENT_VISIBILITIES = ['private', 'workspace'];
export const AGENT_COLORS = ['violet', 'blue', 'teal', 'green', 'amber', 'rose', 'slate'];
export const MAX_AGENT_FILES = 10;
export const MAX_AGENT_NOTES = 10;
export const MAX_AGENT_SKILLS = 8;
export const MAX_AGENT_STARTERS = 4;
export const AGENT_INSTRUCTIONS_MAX = 8_000;
export const AGENT_KNOWLEDGE_MAX = 30_000;

// A custom AI assistant ("my own AI"): a saved name, persona and knowledge
// that is sent with every question asked to it. Gemini is not fine-tuned;
// the assistant is "trained" by its instructions, knowledge and memories.
const aiAgentSchema = new Schema(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    emoji: { type: String, trim: true, maxlength: 8, default: '' },
    color: { type: String, enum: AGENT_COLORS, default: 'violet' },
    // Persona, tone and rules: "You are our script doctor…".
    instructions: { type: String, trim: true, maxlength: AGENT_INSTRUCTIONS_MAX, default: '' },
    // Free text it always knows: brand guide, rates, style rules, examples.
    knowledge: { type: String, trim: true, maxlength: AGENT_KNOWLEDGE_MAX, default: '' },
    // Files and notes always read with each question (when the asker may open them).
    fileIds: { type: [Schema.Types.ObjectId], ref: 'StoredFile', default: [] },
    noteIds: { type: [Schema.Types.ObjectId], ref: 'QuickNote', default: [] },
    // Skills always on for this assistant (custom ids or built-in keys).
    skills: { type: [String], default: [] },
    // Suggested first questions shown on its welcome screen.
    starters: { type: [{ type: String, trim: true, maxlength: 160 }], default: [] },
    // 0 = precise, 1 = creative.
    creativity: { type: Number, min: 0, max: 1, default: 0.3 },
    // Off: it neither reads nor saves memories.
    useMemory: { type: Boolean, default: true },
    visibility: { type: String, enum: AGENT_VISIBILITIES, default: 'private' },
  },
  { timestamps: true },
);

aiAgentSchema.plugin(workspaceScopePlugin);
aiAgentSchema.index({ workspaceId: 1, createdBy: 1 });
aiAgentSchema.index({ workspaceId: 1, visibility: 1 });

export const AiAgent = mongoose.model('AiAgent', aiAgentSchema);
