import mongoose, { Schema } from 'mongoose';
import { cacheInvalidationPlugin, idsIn } from '../../utils/cacheInvalidation.plugin.js';

const oneTimeTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

// Printed on invoices under "Billed to". Every field is optional.
const billingProfileSchema = new Schema(
  {
    companyName: { type: String, trim: true, maxlength: 120, default: null },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 15, default: null },
    addressLine: { type: String, trim: true, maxlength: 200, default: null },
    city: { type: String, trim: true, maxlength: 60, default: null },
    state: { type: String, trim: true, maxlength: 60, default: null },
    postalCode: { type: String, trim: true, maxlength: 12, default: null },
    country: { type: String, trim: true, maxlength: 60, default: null },
    phone: { type: String, trim: true, maxlength: 20, default: null },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Optional so accounts created through Google login (planned) can exist without one.
    passwordHash: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    // false for accounts made with Google that never set a password; older
    // accounts lack the field and all have one.
    hasPassword: { type: Boolean, default: true },
    avatarUrl: { type: String, default: null },
    billingProfile: { type: billingProfileSchema, default: () => ({}) },

    emailVerifiedAt: { type: Date, default: null },
    emailVerification: { type: oneTimeTokenSchema, select: false },
    passwordReset: { type: oneTimeTokenSchema, select: false },

    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },

    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    isSuperadmin: { type: Boolean, default: false },
    trialStartedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ 'emailVerification.tokenHash': 1 }, { sparse: true });
userSchema.index({ 'passwordReset.tokenHash': 1 }, { sparse: true });
userSchema.index({ lastActiveAt: -1 });

// Each request's session user is cached (session.service.js); writes clear it.
userSchema.plugin(cacheInvalidationPlugin, {
  scopesFor: (source) => idsIn(source._id)?.map((id) => `user:${id}`) ?? null,
});

export const User = mongoose.model('User', userSchema);
