import argon2 from 'argon2';
import { randomToken } from './crypto.js';

// OWASP-recommended argon2id baseline.
const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

let dummyHashPromise;

export function hashPassword(plainPassword) {
  return argon2.hash(plainPassword, HASH_OPTIONS);
}

export async function verifyPassword(passwordHash, plainPassword) {
  try {
    return await argon2.verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

// Spend the same time on unknown emails as on real ones,
// so response timing does not reveal which emails have accounts.
export async function burnPasswordCheck(plainPassword) {
  dummyHashPromise ??= hashPassword(randomToken());
  await verifyPassword(await dummyHashPromise, plainPassword);
}
