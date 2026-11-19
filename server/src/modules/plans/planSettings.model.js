import mongoose, { Schema } from 'mongoose';
import { cacheInvalidationPlugin } from '../../utils/cacheInvalidation.plugin.js';

export const PLAN_SETTINGS_SCOPE = 'plan-settings';

// What the platform admin changed about the price list: per paid plan, the
// free plan, the yearly offer and the referral rewards. One document; until it
// is first saved the defaults in plans.catalog.js apply. Plan codes are fixed
// (starter, studio, agency), so payments and limits keyed by them stay valid.
const planSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    plans: { type: Schema.Types.Mixed, default: () => ({}) },
    free: { type: Schema.Types.Mixed, default: null },
    offer: { type: Schema.Types.Mixed, default: null },
    referral: { type: Schema.Types.Mixed, default: null },
    // { maxDiscountPercent }: the most any mix of discounts may take off.
    pricing: { type: Schema.Types.Mixed, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

planSettingsSchema.plugin(cacheInvalidationPlugin, { scopesFor: () => [PLAN_SETTINGS_SCOPE] });

export const PlanSettings = mongoose.model('PlanSettings', planSettingsSchema);
