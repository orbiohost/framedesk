import mongoose, { Schema } from 'mongoose';

export const BILLING_STATUSES = ['none', 'trialing', 'active', 'past_due', 'read_only', 'canceled'];

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

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Extra workspaces an owner creates share the plan and storage of the owner's
    // first ("account") workspace. null means this workspace is the account itself.
    storagePoolId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    billing: { type: billingSnapshotSchema, default: () => ({}) },
    storage: { type: storageSchema, default: () => ({}) },
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

export const Workspace = mongoose.model('Workspace', workspaceSchema);
