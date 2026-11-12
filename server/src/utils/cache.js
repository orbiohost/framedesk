import mongoose from 'mongoose';
import { onRedisReady, redisClient, redisEnabled } from '../config/redis.js';
import { logger } from './logger.js';

// Short-lived Redis cache for the lookups every request makes (session user,
// workspace, membership). Correctness comes from invalidation, not the TTL:
//
// - Each cached value belongs to one or more "scopes" (e.g. user:<id>). Every
//   scope has a generation counter in Redis, and the cache key includes the
//   generations read *before* the value was loaded from MongoDB.
// - A write to MongoDB bumps the scope's generation (see
//   cacheInvalidation.plugin.js), so older entries are never read again. A
//   request that loaded stale data during the write stores it under the old
//   generation, where nobody looks.
// - If a bump can't reach Redis, this process stops trusting the cache until
//   a global bump succeeds after reconnecting.
//
// Generation keys have no TTL, so with `maxmemory-policy volatile-lru` Redis
// only ever evicts cache entries and rate-limit counters, never generations.

const PREFIX = 'fd:';
const TTL_SECONDS = 60;
const GLOBAL_SCOPE = 'global';
const { EJSON } = mongoose.mongo.BSON;

let trusted = true;
// Counts failed invalidations, so a reset that raced one doesn't restore trust.
let failures = 0;
let lastRecoveryAttempt = 0;
const RECOVERY_INTERVAL_MS = 5000;

const genKey = (scope) => `${PREFIX}gen:${scope}`;

function logFailure(err, message) {
  logger.debug({ err: err.message }, message);
}

// EJSON keeps ObjectIds and Dates intact, so a hit looks exactly like .lean().
const serialize = (value) => EJSON.stringify(value, { relaxed: true });
const deserialize = (text) => EJSON.parse(text, { relaxed: true });

// Invalidating everything makes it safe to trust the cache again.
async function resetAll(redis) {
  const failuresBefore = failures;
  await redis.incr(genKey(GLOBAL_SCOPE));
  if (failures === failuresBefore) trusted = true;
}

function distrust() {
  failures += 1;
  trusted = false;
}

// The connection can stay up through a failed bump (e.g. a timeout), so retry
// the reset now and then instead of waiting for a reconnect.
function usableClient() {
  const redis = redisClient();
  if (!redis || trusted) return redis;
  const now = Date.now();
  if (now - lastRecoveryAttempt >= RECOVERY_INTERVAL_MS) {
    lastRecoveryAttempt = now;
    resetAll(redis).catch((err) => logFailure(err, 'Cache recovery failed'));
  }
  return null;
}

// Returns load()'s result, from Redis when it is there. Only truthy results
// are cached: "not found" always asks MongoDB again.
export async function cached(key, scopes, load) {
  const redis = usableClient();
  if (!redis) return load();

  let fullKey;
  try {
    const generations = await redis.mget([GLOBAL_SCOPE, ...scopes].map(genKey));
    fullKey = `${PREFIX}c:${key}:${generations.map((gen) => gen ?? '0').join('.')}`;
    const hit = await redis.get(fullKey);
    if (hit !== null) return deserialize(hit);
  } catch (err) {
    logFailure(err, 'Cache read failed');
    return load();
  }

  const value = await load();
  if (value) {
    redis
      .set(fullKey, serialize(value), 'EX', TTL_SECONDS)
      .catch((err) => logFailure(err, 'Cache write failed'));
  }
  return value;
}

// Makes every cached value in these scopes stale. With no scopes (a write we
// can't attribute to specific documents), everything is invalidated.
export async function invalidate(scopes) {
  if (!redisEnabled) return;
  const keys = (scopes?.length ? scopes : [GLOBAL_SCOPE]).map(genKey);
  const redis = redisClient();
  if (!redis) {
    distrust();
    return;
  }
  try {
    const pipeline = redis.pipeline();
    for (const key of keys) pipeline.incr(key);
    const results = await pipeline.exec();
    if (results.some(([err]) => err)) throw results.find(([err]) => err)[0];
  } catch (err) {
    distrust();
    logger.warn(
      { err: err.message },
      'Cache invalidation failed; bypassing the cache until Redis recovers',
    );
  }
}

// Writes may have been missed while Redis was away (or before this process
// started), so drop everything each time the connection is (re)established.
onRedisReady(async () => {
  const redis = redisClient();
  if (redis) await resetAll(redis);
});
