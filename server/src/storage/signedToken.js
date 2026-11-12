import { createHmac } from 'node:crypto';
import { storageConfig } from '../config/storage.js';
import { safeEqual } from '../utils/crypto.js';

// Compact signed token: base64url(JSON payload) + "." + HMAC. The payload carries
// the storage key and response headers; it never contains a filesystem path.

function sign(encodedPayload) {
  return createHmac('sha256', storageConfig.urlSecret).update(encodedPayload).digest('base64url');
}

export function createToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

// Returns the payload, or null when the token is forged, malformed or expired.
export function readToken(token) {
  const [encoded, signature] = String(token).split('.');
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}
