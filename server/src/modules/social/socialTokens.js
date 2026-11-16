import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import mongoose, { Schema } from 'mongoose';
import { env } from '../../config/env.js';

// Social access tokens are stored encrypted (AES-256-GCM), so a database dump
// alone can't be used to read anyone's Instagram or YouTube.
const KEY = createHash('sha256')
  .update(
    env.SOCIAL_TOKEN_SECRET ??
      createHmac('sha256', env.JWT_ACCESS_SECRET).update('social-tokens').digest('base64url'),
  )
  .digest();

export function sealToken(plain) {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
}

// Returns null when the token can't be read (e.g. the secret changed): the
// account then asks to be reconnected.
export function openToken(sealed) {
  if (!sealed) return null;
  try {
    const [version, iv, tag, body] = String(sealed).split('.');
    if (version !== 'v1') return null;
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

// One pending "link my account" trip to a platform's login page. Looked up by
// state on the way back, used once, and gone after ten minutes either way.
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const oauthStateSchema = new Schema({
  state: { type: String, required: true, unique: true },
  provider: { type: String, required: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  verifier: { type: String, default: null },
  returnTo: { type: String, default: null },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export const SocialOAuthState = mongoose.model('SocialOAuthState', oauthStateSchema);
