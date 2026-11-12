import { randomBytes } from 'node:crypto';
import { AppError } from '../../utils/AppError.js';
import { Avatar } from './avatar.model.js';
import { User } from './user.model.js';

export const MAX_AVATAR_BYTES = 200 * 1024;
const AVATAR_PATH = '/api/avatars/';

// Checked against the bytes themselves, not the type the browser claimed.
const SIGNATURES = [
  {
    type: 'image/png',
    matches: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { type: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/webp',
    matches: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

function decodeImage(dataUrl) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw AppError.badRequest('Upload a PNG, JPEG or WebP image', 'INVALID_IMAGE');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_AVATAR_BYTES) {
    throw AppError.badRequest('That image is too large', 'IMAGE_TOO_LARGE');
  }
  const signature = SIGNATURES.find((s) => s.matches(bytes));
  if (!signature) throw AppError.badRequest('That file is not a valid image', 'INVALID_IMAGE');
  return { bytes, contentType: signature.type };
}

async function removeAvatarsOf(userId) {
  await Avatar.deleteMany({ userId });
}

export async function setAvatar(userId, dataUrl) {
  const { bytes, contentType } = decodeImage(dataUrl);
  const key = randomBytes(18).toString('base64url');
  await removeAvatarsOf(userId);
  await Avatar.create({ key, userId, contentType, data: bytes });
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { avatarUrl: `${AVATAR_PATH}${key}` } },
    { new: true },
  );
  if (!user) throw AppError.notFound('User not found');
  return user;
}

export async function clearAvatar(userId) {
  await removeAvatarsOf(userId);
  const user = await User.findByIdAndUpdate(userId, { $set: { avatarUrl: null } }, { new: true });
  if (!user) throw AppError.notFound('User not found');
  return user;
}

export async function findAvatar(key) {
  return Avatar.findOne({ key }).select('contentType data').lean();
}
