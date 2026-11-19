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

// How and when this person gets reminders (notifications/ module).
const notificationPrefsSchema = new Schema(
  {
    // Reminders on devices that turned notifications on.
    push: { type: Boolean, default: true },
    // fallback: email only when no device received the reminder.
    email: { type: String, enum: ['always', 'fallback', 'off'], default: 'fallback' },
    // Deadlines and all-day events have no time: remind at this hour, local time.
    dayReminderHour: { type: Number, min: 0, max: 23, default: 9 },
    // IANA zone reported by the person's browser, e.g. "Asia/Kolkata".
    timeZone: { type: String, maxlength: 64, default: 'Asia/Kolkata' },
  },
  { _id: false },
);

// Project alerts this person receives (alerts/ module): how they ring.
// Defaults live in alerts/alertSettings.js.
const alertPrefsSchema = new Schema(
  {
    enabled: { type: Boolean },
    sound: { type: String, maxlength: 20 },
    volume: { type: Number, min: 0, max: 1 },
    ringSeconds: { type: Number, min: 3, max: 300 },
    repeatMinutes: { type: Number, min: 1, max: 1440 },
    // 0: forever, until the project is opened.
    maxRepeats: { type: Number, min: 0, max: 1000 },
    vibrate: { type: Boolean },
    // everyone: any workspace member who can edit; admins: owners and admins only.
    allowFrom: { type: String, enum: ['everyone', 'admins'] },
    quietHours: {
      enabled: { type: Boolean },
      start: { type: Number, min: 0, max: 23 },
      end: { type: Number, min: 0, max: 23 },
    },
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
    notificationPrefs: { type: notificationPrefsSchema, default: () => ({}) },
    alertPrefs: { type: alertPrefsSchema, default: () => ({}) },
    // Audio and video this person drops into a project's "Notes & Briefs"
    // folder are transcribed by themselves when no longer than this many
    // minutes (0: never). Unset means the default (AUTO_TRANSCRIBE_DEFAULT_MINUTES).
    autoTranscribeMinutes: { type: Number, min: 0, max: 600, default: undefined },

    emailVerifiedAt: { type: Date, default: null },
    emailVerification: { type: oneTimeTokenSchema, select: false },
    passwordReset: { type: oneTimeTokenSchema, select: false },

    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },

    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    isSuperadmin: { type: Boolean, default: false },
    trialStartedAt: { type: Date, default: null },
    // Refer & earn (referrals/referrals.service.js). referralCode is this
    // person's own code; referredBy is whoever invited them.
    referralCode: { type: String, default: undefined },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    referredAt: { type: Date, default: null },
    // Set once the inviter got their storage for this person.
    referralRewardedAt: { type: Date, default: null },
    // How many friends earned this person storage so far.
    referralRewards: { type: Number, default: 0, min: 0 },
    // Set when this person's referral discount was used on a payment.
    referralDiscountUsedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ 'emailVerification.tokenHash': 1 }, { sparse: true });
userSchema.index({ 'passwordReset.tokenHash': 1 }, { sparse: true });
userSchema.index({ lastActiveAt: -1 });
userSchema.index({ referralCode: 1 }, { unique: true, sparse: true });
userSchema.index({ referredBy: 1 });

// Each request's session user is cached (session.service.js); writes clear it.
userSchema.plugin(cacheInvalidationPlugin, {
  scopesFor: (source) => idsIn(source._id)?.map((id) => `user:${id}`) ?? null,
});

export const User = mongoose.model('User', userSchema);
