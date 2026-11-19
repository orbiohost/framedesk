import mongoose, { Schema } from 'mongoose';
import { cacheInvalidationPlugin } from '../../utils/cacheInvalidation.plugin.js';

export const AI_SETTINGS_SCOPE = 'ai-settings';

const creditPackSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, maxlength: 40 },
    credits: { type: Number, required: true, min: 1 },
    // Rupees, before GST.
    price: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

// The AI assistant's switches and credit rules, edited by the platform admin.
// One document; until it is first saved the defaults in aiSettings.service.js apply.
const aiSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    enabled: { type: Boolean, default: true },
    // Also analyse every upload in the background. Off: files are analysed (and
    // charged) only when someone asks the assistant about them.
    autoAnalyze: { type: Boolean, default: false },
    model: { type: String, trim: true, maxlength: 60, default: null },
    // Usage limits per plan, like Claude's: credits per rolling 5-hour session
    // and per 7-day week. { starter: { session: 30, weekly: 200 }, ... }
    planLimits: { type: Schema.Types.Mixed, default: () => ({}) },
    freeLimits: { type: Schema.Types.Mixed, default: null },
    trialLimits: { type: Schema.Types.Mixed, default: null },
    // Price (rupees, before GST) to reset the limits now, per plan and for the trial.
    resetPrices: { type: Schema.Types.Mixed, default: () => ({}) },
    // Older monthly allowance settings, no longer used.
    planCredits: { type: Schema.Types.Mixed, default: undefined },
    trialCredits: { type: Number, default: undefined },
    // How many Gemini tokens one credit buys, and the least an action costs.
    tokensPerCredit: { type: Number, min: 100, default: 10_000 },
    minChatCredits: { type: Number, min: 0, default: 1 },
    minAnalysisCredits: { type: Number, min: 0, default: 1 },
    // Larger files are analysed from their transcript (if any) instead.
    maxAnalysisMB: { type: Number, min: 1, max: 2000, default: 1024 },
    packs: { type: [creditPackSchema], default: undefined },
    // Image generation: the Gemini image model, credits per image, and how
    // many reference images one request may carry, per plan code.
    imageModel: { type: String, trim: true, maxlength: 60, default: null },
    imageCredits: { type: Number, min: 0, default: 5 },
    refImageLimits: { type: Schema.Types.Mixed, default: () => ({}) },
    // Changes to the model catalog (aiModels.js), by model key:
    // { 'frame-ultra': { name, tagline, badge, status, engine, creditMultiplier } }
    models: { type: Schema.Types.Mixed, default: () => ({}) },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

aiSettingsSchema.plugin(cacheInvalidationPlugin, { scopesFor: () => [AI_SETTINGS_SCOPE] });

export const AiSettings = mongoose.model('AiSettings', aiSettingsSchema);
