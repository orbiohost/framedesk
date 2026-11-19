import mongoose, { Schema } from 'mongoose';
import { cacheInvalidationPlugin, idsIn } from '../../utils/cacheInvalidation.plugin.js';

// free: the free plan (FREE_PLAN). trialing: the old 7-day trial, no longer given.
export const BILLING_STATUSES = [
  'none',
  'free',
  'trialing',
  'active',
  'past_due',
  'read_only',
  'canceled',
];

// Snapshot of the workspace's subscription state, kept here so every request can
// check limits without a join. The billing module (Phase 5) owns writes to it.
const billingSnapshotSchema = new Schema(
  {
    planCode: { type: String, default: null },
    status: { type: String, enum: BILLING_STATUSES, default: 'none' },
    trialEndsAt: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    interval: { type: String, enum: ['monthly', 'yearly', null], default: null },
    // What the workspace pays per interval, in rupees (drives MRR).
    amount: { type: Number, min: 0, default: null },
    canceledAt: { type: Date, default: null },
    // When the plan was first seen to have run out; the grace period counts
    // from here (or from currentPeriodEnd, whichever is later).
    pastDueSince: { type: Date, default: null },
    // The period end a renewal reminder was last sent for (one email per period).
    renewalRemindedFor: { type: Date, default: null },
  },
  { _id: false },
);

const storageSchema = new Schema(
  {
    usedBytes: { type: Number, default: 0, min: 0 },
    planLimitBytes: { type: Number, default: 0, min: 0 },
    bonusBytes: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

// AI assistant usage, kept on the account workspace like storage. The plan's
// 5-hour and weekly limits are used first; purchased and granted credits
// ("extra usage") never expire and are used once a limit is reached.
const aiSchema = new Schema(
  {
    // Usage windows, like Claude's: a 5-hour session that starts with the first
    // request after the last one ended, and a 7-day week that works the same way.
    sessionStartedAt: { type: Date, default: null },
    sessionUsed: { type: Number, default: 0, min: 0 },
    weekStartedAt: { type: Date, default: null },
    weekUsed: { type: Number, default: 0, min: 0 },
    // Older monthly allowance, no longer used.
    allowancePeriod: { type: String, default: null },
    allowanceUsed: { type: Number, default: 0, min: 0 },
    purchasedCredits: { type: Number, default: 0, min: 0 },
    // Set by the platform admin to keep the assistant off for this account.
    blocked: { type: Boolean, default: false },
  },
  { _id: false },
);

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Extra workspaces an owner creates share the plan and storage of the owner's
    // first ("account") workspace. null means this workspace is the account itself.
    storagePoolId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    billing: { type: billingSnapshotSchema, default: () => ({}) },
    storage: { type: storageSchema, default: () => ({}) },
    ai: { type: aiSchema, default: () => ({}) },
    // The folders every new project starts with, in order, as set in the
    // project settings. Missing: the built-in list (DEFAULT_FOLDERS).
    // "Notes & Briefs" is always added on top of these.
    projectFolders: { type: [String], default: undefined },
    // { [projectType]: [{ title, daysBeforeDue, priority }] }: the task list a
    // new project of that type starts with. A missing type uses the built-in
    // list (projects/taskTemplates.js); [] means no tasks.
    projectTaskTemplates: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true },
);

workspaceSchema.index({ ownerId: 1 });
workspaceSchema.index({ 'billing.status': 1 });
workspaceSchema.index({ storagePoolId: 1 });

export function storageLimitBytes(workspace) {
  return workspace.storage.planLimitBytes + workspace.storage.bonusBytes;
}

// The id of the workspace whose plan and storage this workspace uses.
export function poolIdOf(workspace) {
  return workspace.storagePoolId ?? workspace._id;
}

// Workspaces are cached per request (storagePool.js); writes clear them.
workspaceSchema.plugin(cacheInvalidationPlugin, {
  scopesFor: (source) => idsIn(source._id)?.map((id) => `workspace:${id}`) ?? null,
});

export const Workspace = mongoose.model('Workspace', workspaceSchema);
