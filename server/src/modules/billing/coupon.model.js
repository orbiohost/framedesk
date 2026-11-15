import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const COUPON_CODE = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

// A code an owner types at checkout for money off a plan, made by the
// platform admin. Either a percentage or a fixed amount (rupees, before GST).
const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 200, default: null },
    percentOff: { type: Number, min: 1, max: 100, default: null },
    amountOff: { type: Number, min: 1, default: null },
    // Empty: every paid plan / both intervals.
    planCodes: { type: [String], default: [] },
    intervals: { type: [String], default: [] },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    // null: no limit.
    maxRedemptions: { type: Number, min: 1, default: null },
    perAccountLimit: { type: Number, min: 1, default: 1 },
    redemptions: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const Coupon = mongoose.model('Coupon', couponSchema);

// One use of a coupon, on a payment. workspaceId is the account that paid.
const couponRedemptionSchema = new Schema(
  {
    couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    code: { type: String, required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true },
    discount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

couponRedemptionSchema.plugin(workspaceScopePlugin);
couponRedemptionSchema.index({ couponId: 1, workspaceId: 1 });

export const CouponRedemption = mongoose.model('CouponRedemption', couponRedemptionSchema);
