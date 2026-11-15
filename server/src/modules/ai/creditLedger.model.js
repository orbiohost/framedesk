import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const LEDGER_KINDS = [
  'chat',
  'analysis',
  'brief',
  'moodboard',
  'purchase',
  'grant',
  'refund',
  'reset',
];

// Every change to an account's AI credits. workspaceId is the account
// (storage pool) workspace that holds the balance.
const creditLedgerSchema = new Schema(
  {
    kind: { type: String, enum: LEDGER_KINDS, required: true },
    // Positive adds credits, negative spends them.
    credits: { type: Number, required: true },
    // Balance right after this entry.
    balanceAfter: { type: Number, default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // The workspace the credits were used in (may differ from the account).
    usedInWorkspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    fileId: { type: Schema.Types.ObjectId, ref: 'File', default: null },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    tokens: { type: Number, default: null },
    note: { type: String, trim: true, maxlength: 200, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

creditLedgerSchema.plugin(workspaceScopePlugin);
creditLedgerSchema.index({ workspaceId: 1, _id: -1 });
creditLedgerSchema.index({ createdAt: -1 });
// A payment adds its credits once, however often checkout and the webhook report it.
creditLedgerSchema.index(
  { paymentId: 1, kind: 1 },
  { unique: true, partialFilterExpression: { paymentId: { $type: 'objectId' } } },
);

export const CreditLedger = mongoose.model('CreditLedger', creditLedgerSchema);
