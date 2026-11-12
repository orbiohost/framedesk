import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function randomToken(byteLength = 32) {
  return randomBytes(byteLength).toString('base64url');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
