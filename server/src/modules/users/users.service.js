import { AppError } from '../../utils/AppError.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { revokeAllSessions } from '../auth/session.service.js';
import { autoTranscribeMinutesOf } from './transcribePrefs.js';
import { User } from './user.model.js';

const BILLING_PROFILE_FIELDS = [
  'companyName',
  'gstin',
  'addressLine',
  'city',
  'state',
  'postalCode',
  'country',
  'phone',
];

export function toBillingProfile(user) {
  const profile = user.billingProfile ?? {};
  return Object.fromEntries(BILLING_PROFILE_FIELDS.map((field) => [field, profile[field] ?? null]));
}

export function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    hasPassword: user.hasPassword !== false,
    googleLinked: Boolean(user.googleId),
    avatarUrl: user.avatarUrl ?? null,
    isSuperadmin: Boolean(user.isSuperadmin),
    createdAt: user.createdAt,
    billingProfile: toBillingProfile(user),
    autoTranscribeMinutes: autoTranscribeMinutesOf(user),
  };
}

// Fields left out of `input` keep their value; null or "" clears one.
export async function updateBillingProfile(userId, input) {
  const set = Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => [`billingProfile.${field}`, value]),
  );
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: set },
    { new: true, runValidators: true },
  );
  if (!user) throw AppError.notFound('User not found');
  return user;
}

export async function updateProfile(userId, { name, autoTranscribeMinutes }) {
  const set = {};
  if (name !== undefined) set.name = name;
  if (autoTranscribeMinutes !== undefined) set.autoTranscribeMinutes = autoTranscribeMinutes;
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: set },
    { new: true, runValidators: true },
  );
  if (!user) throw AppError.notFound('User not found');
  return user;
}

// Signs out every other device; the session making the change stays signed in.
// Someone who signed up with Google and never had a password sets their first
// one without a current password.
export async function changePassword(userId, { currentPassword, newPassword }, currentSessionId) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw AppError.notFound('User not found');
  const settingFirstPassword = !user.passwordHash && user.hasPassword === false;
  if (!settingFirstPassword) {
    const isCorrect =
      user.passwordHash &&
      currentPassword &&
      (await verifyPassword(user.passwordHash, currentPassword));
    if (!isCorrect) {
      throw AppError.badRequest('Your current password is incorrect', 'WRONG_PASSWORD');
    }
  }

  user.passwordHash = await hashPassword(newPassword);
  user.hasPassword = true;
  await user.save();
  await revokeAllSessions(userId, 'password_changed', { exceptSessionId: currentSessionId });
}
