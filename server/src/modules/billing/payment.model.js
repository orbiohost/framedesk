import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const PAYMENT_METHODS = ['upi', 'bank_transfer', 'card', 'cash', 'razorpay', 'other'];

// GST charged on a payment, fixed when the payment is made.
export const taxSnapshotSchema = new Schema(
  {
    rate: Number,
    amount: Number,
    interState: Boolean,
    cgst: Number,
    sgst: Number,
    igst: Number,
    placeOfSupply: { code: String, name: String },
    sellerGstin: String,
    buyerGstin: String,
    sacCode: String,
  },
  { _id: false },
);

// Who the invoice is addressed to, copied at payment time so later profile
// edits don't rewrite past invoices.
export const billedToSnapshotSchema = new Schema(
  {
    name: String,
    email: String,
    companyName: String,
    gstin: String,
    addressLine: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
    phone: String,
  },
  { _id: false },
);

// The seller block as printed when the invoice was issued.
export const sellerSnapshotSchema = new Schema(
  {
    name: String,
    addressLines: [String],
    email: String,
    phone: String,
    gstin: String,
    footerNote: String,
  },
  { _id: false },
);

// Money received. Recorded by an admin today; Razorpay webhooks (Phase 5) add
// rows with source "razorpay" to the same collection, so sales reports don't change.
const paymentSchema = new Schema(
  {
    // Total received, GST included.
    amount: { type: Number, required: true, min: 0 },
    // The amount before GST. null on payments recorded before GST was tracked.
    taxableAmount: { type: Number, min: 0, default: null },
    tax: { type: taxSnapshotSchema, default: null },
    billedTo: { type: billedToSnapshotSchema, default: null },
    seller: { type: sellerSnapshotSchema, default: null },
    // Sequential per financial year (FD/26-27/0001). null on older payments,
    // which show a number derived from their id instead.
    invoiceNumber: { type: String, default: null },
    currency: { type: String, default: 'INR' },
    planCode: { type: String, required: true },
    interval: { type: String, enum: ['monthly', 'yearly'], required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    reference: { type: String, trim: true, maxlength: 120, default: null },
    offerCode: { type: String, default: null },
    source: { type: String, enum: ['manual', 'razorpay'], default: 'manual' },
    paidAt: { type: Date, required: true },
    // Where the time this payment bought begins (after any time already paid
    // for). null on older payments. A full refund takes back periodEnd - periodStart.
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, required: true },
    // Set from Razorpay refund webhooks. refundedAt is set only on a full refund.
    refundedAmount: { type: Number, min: 0, default: 0 },
    refundedAt: { type: Date, default: null },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    upgradeRequestId: { type: Schema.Types.ObjectId, ref: 'UpgradeRequest', default: null },
    razorpay: {
      type: new Schema({ orderId: String, paymentId: String, method: String }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true },
);

paymentSchema.plugin(workspaceScopePlugin);
paymentSchema.index({ paidAt: -1 });
paymentSchema.index({ workspaceId: 1, paidAt: -1 });
paymentSchema.index(
  { invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } },
);
// A Razorpay payment is recorded once, however many times checkout and the webhook report it.
paymentSchema.index(
  { 'razorpay.paymentId': 1 },
  { unique: true, partialFilterExpression: { 'razorpay.paymentId': { $type: 'string' } } },
);

export const Payment = mongoose.model('Payment', paymentSchema);
