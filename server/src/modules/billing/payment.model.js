import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const PAYMENT_METHODS = ['upi', 'bank_transfer', 'card', 'cash', 'razorpay', 'other'];

// Money received. Recorded by an admin today; Razorpay webhooks (Phase 5) add
// rows with source "razorpay" to the same collection, so sales reports don't change.
const paymentSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    planCode: { type: String, required: true },
    interval: { type: String, enum: ['monthly', 'yearly'], required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    reference: { type: String, trim: true, maxlength: 120, default: null },
    offerCode: { type: String, default: null },
    source: { type: String, enum: ['manual', 'razorpay'], default: 'manual' },
    paidAt: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    upgradeRequestId: { type: Schema.Types.ObjectId, ref: 'UpgradeRequest', default: null },
  },
  { timestamps: true },
);

paymentSchema.plugin(workspaceScopePlugin);
paymentSchema.index({ paidAt: -1 });
paymentSchema.index({ workspaceId: 1, paidAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);
