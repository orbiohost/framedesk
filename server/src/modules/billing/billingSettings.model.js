import mongoose, { Schema } from 'mongoose';
import { cacheInvalidationPlugin } from '../../utils/cacheInvalidation.plugin.js';

export const SETTINGS_SCOPE = 'billing-settings';

// The seller side of every invoice, edited by the platform admin. One document.
// Until it is first saved, values come from the INVOICE_* / GST_* env vars.
const billingSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    businessName: { type: String, trim: true, maxlength: 120, required: true },
    addressLine: { type: String, trim: true, maxlength: 200, default: null },
    city: { type: String, trim: true, maxlength: 60, default: null },
    state: { type: String, trim: true, maxlength: 60, default: null },
    postalCode: { type: String, trim: true, maxlength: 12, default: null },
    country: { type: String, trim: true, maxlength: 60, default: 'India' },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
    phone: { type: String, trim: true, maxlength: 20, default: null },

    gstEnabled: { type: Boolean, default: false },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 15, default: null },
    gstRate: { type: Number, min: 0, max: 28, default: 18 },
    sacCode: { type: String, trim: true, maxlength: 8, default: null },

    invoicePrefix: { type: String, trim: true, uppercase: true, maxlength: 5, default: 'FD' },
    footerNote: { type: String, trim: true, maxlength: 240, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

billingSettingsSchema.plugin(cacheInvalidationPlugin, { scopesFor: () => [SETTINGS_SCOPE] });

export const BillingSettings = mongoose.model('BillingSettings', billingSettingsSchema);

// Running invoice serials, one counter per financial year.
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = mongoose.model('Counter', counterSchema);
