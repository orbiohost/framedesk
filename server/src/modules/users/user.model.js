import mongoose, { Schema } from 'mongoose';

const oneTimeTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
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
    avatarUrl: { type: String, default: null },

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

export const User = mongoose.model('User', userSchema);
