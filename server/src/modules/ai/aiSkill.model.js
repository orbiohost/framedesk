import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const SKILL_VISIBILITIES = ['private', 'workspace'];
export const SKILL_CATEGORIES = [
  'writing',
  'video',
  'social',
  'client',
  'planning',
  'analysis',
  'other',
];
export const SKILL_INSTRUCTIONS_MAX = 6_000;
export const SKILL_EXAMPLE_MAX = 4_000;

// A reusable prompt skill: saved instructions picked with "!" in the chat
// (e.g. "YouTube description", "Shot list from script") or switched on for
// an assistant. Built-in skills live in aiSkills.service.js, not here.
const aiSkillSchema = new Schema(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    emoji: { type: String, trim: true, maxlength: 8, default: '' },
    category: { type: String, enum: SKILL_CATEGORIES, default: 'other' },
    instructions: { type: String, required: true, trim: true, maxlength: SKILL_INSTRUCTIONS_MAX },
    // A sample of a great answer: the model matches its shape and tone.
    example: { type: String, trim: true, maxlength: SKILL_EXAMPLE_MAX, default: '' },
    visibility: { type: String, enum: SKILL_VISIBILITIES, default: 'private' },
    // How often it was picked in a chat, so the "!" list leads with favourites.
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

aiSkillSchema.plugin(workspaceScopePlugin);
aiSkillSchema.index({ workspaceId: 1, createdBy: 1 });
aiSkillSchema.index({ workspaceId: 1, visibility: 1 });

export const AiSkill = mongoose.model('AiSkill', aiSkillSchema);
