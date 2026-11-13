import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';
import { billedToSnapshotSchema, taxSnapshotSchema } from './payment.model.js';

export const CHECKOUT_STATUSES = ['created', 'paid', 'failed'];

// How long an order's price holds. Razorpay orders never expire on their own,
// so without this an order made during an offer could be paid months later.
export const CHECKOUT_ORDER_TTL_MS = 30 * 60 * 1000;

// A Razorpay order we created for a plan purchase. The price, GST and buyer
// are fixed here, so what is charged is exactly what was shown at checkout.
const checkoutOrderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    planCode: { type: String, required: true },
    interval: { type: String, enum: ['monthly', 'yearly'], required: true },
    offerCode: { type: String, default: null },
    taxableAmount: { type: Number, required: true, min: 0 },
    tax: { type: taxSnapshotSchema, default: null },
    // Rupees, GST included; amountPaise is the same figure as Razorpay sees it.
    amount: { type: Number, required: true, min: 0 },
    amountPaise: { type: Number, required: true, min: 100 },
    currency: { type: String, default: 'INR' },
    billedTo: { type: billedToSnapshotSchema, default: null },
    razorpayOrderId: { type: String, required: true, unique: true },
    status: { type: String, enum: CHECKOUT_STATUSES, default: 'created' },
    razorpayPaymentId: { type: String, default: null },
    failureReason: { type: String, default: null },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    paidAt: { type: Date, default: null },
    expiresAt: { type: Date, default: () => new Date(Date.now() + CHECKOUT_ORDER_TTL_MS) },
  },
  { timestamps: true },
);

checkoutOrderSchema.plugin(workspaceScopePlugin);
checkoutOrderSchema.index({ workspaceId: 1, createdAt: -1 });

export const CheckoutOrder = mongoose.model('CheckoutOrder', checkoutOrderSchema);
