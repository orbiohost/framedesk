import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const UPGRADE_REQUEST_STATUSES = ['open', 'activated', 'dismissed'];

// A workspace asking to move to a paid plan. Until online payment (Phase 5)
// the team activates these by hand from the admin screen.
const upgradeRequestSchema = new Schema(
  {
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    planCode: { type: String, required: true },
    interval: { type: String, enum: ['monthly', 'yearly'], required: true },
    // Rupees, quoted by the server at request time (offer included).
    quotedAmount: { type: Number, required: true, min: 0 },
    offerCode: { type: String, default: null },
    status: { type: String, enum: UPGRADE_REQUEST_STATUSES, default: 'open' },
    activatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    activatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

upgradeRequestSchema.plugin(workspaceScopePlugin);
upgradeRequestSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
upgradeRequestSchema.index({ status: 1, createdAt: -1 });

export const UpgradeRequest = mongoose.model('UpgradeRequest', upgradeRequestSchema);
