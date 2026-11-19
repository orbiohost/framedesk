import mongoose, { Schema } from 'mongoose';

// What running FrameDesk costs: prices for the usage-based services, the last
// measurement of the S3 bucket and of the AWS bill, and the fixed expenses an
// admin enters (VPS, domain, email...). Platform-wide, not per workspace.

export const EXPENSE_CATEGORIES = [
  'hosting',
  'storage',
  'ai',
  'domain',
  'email',
  'software',
  'marketing',
  'salaries',
  'other',
];
export const EXPENSE_CYCLES = ['monthly', 'yearly', 'one_time'];
export const CURRENCIES = ['INR', 'USD'];

const serviceCostSchema = new Schema({ name: String, amount: Number }, { _id: false });

const costSettingsSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true },
    // Rupees per US dollar, for services billed in dollars.
    usdToInr: { type: Number, min: 1, max: 1000, default: 88 },
    // Amazon S3 Standard, per GB-month (eu-north-1 list price; check your bill).
    s3PricePerGbMonthUsd: { type: Number, min: 0, max: 10, default: 0.023 },
    // Gemini: one blended price per million tokens (input and output together).
    aiPricePerMillionTokensUsd: { type: Number, min: 0, max: 1000, default: 0.4 },
    // On the free tier Google charges nothing; costs are shown as "if paid".
    aiFreeTier: { type: Boolean, default: true },
    // Cloudflare Workers AI images (FLUX), per image. 0 while on the free allowance.
    imagePriceUsd: { type: Number, min: 0, max: 10, default: 0 },

    // Last full listing of the bucket.
    bucketScan: {
      scannedAt: { type: Date, default: null },
      bytes: { type: Number, default: 0 },
      objects: { type: Number, default: 0 },
      // Uploads started but never finished: S3 keeps (and bills) their parts.
      incompleteUploads: { type: Number, default: 0 },
      incompleteBytes: { type: Number, default: 0 },
      truncated: { type: Boolean, default: false },
      error: { type: String, default: null },
    },
    // Month-to-date AWS bill from Cost Explorer (each call costs $0.01).
    awsBill: {
      fetchedAt: { type: Date, default: null },
      month: { type: String, default: null },
      totalUsd: { type: Number, default: 0 },
      forecastUsd: { type: Number, default: null },
      services: { type: [serviceCostSchema], default: [] },
      error: { type: String, default: null },
    },
  },
  { timestamps: true },
);

export const CostSettings = mongoose.model('CostSettings', costSettingsSchema);

const expenseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    vendor: { type: String, trim: true, maxlength: 120, default: '' },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: 'other' },
    amount: { type: Number, required: true, min: 0, max: 100_000_000 },
    currency: { type: String, enum: CURRENCIES, default: 'INR' },
    cycle: { type: String, enum: EXPENSE_CYCLES, default: 'monthly' },
    // From when it is paid (one-off: the day it was paid) and, once stopped, until when.
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    // When it renews next, for a reminder on the page.
    renewsAt: { type: Date, default: null },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const Expense = mongoose.model('Expense', expenseSchema);
