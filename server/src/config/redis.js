import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// Redis is optional. Without REDIS_URL, or whenever Redis is unreachable, every
// caller falls back to MongoDB (cache) or to in-process memory (rate limits),
// so an outage makes the site slower, never broken.

const RATE_LIMIT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}`;

let client = null;
const readyListeners = [];

export const redisEnabled = Boolean(env.REDIS_URL);

export function connectRedis() {
  if (!redisEnabled || client) return;

  let warned = false;
  client = new Redis(env.REDIS_URL, {
    // Never queue commands while disconnected: a request must not wait for
    // Redis to come back. Callers check redisClient() and fall back instead.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 250,
    connectTimeout: 2000,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
  });
  client.defineCommand('rateLimitHit', { numberOfKeys: 1, lua: RATE_LIMIT_SCRIPT });

  client.on('ready', () => {
    warned = false;
    logger.info('Redis connected');
    for (const listener of readyListeners) {
      Promise.resolve()
        .then(listener)
        .catch((err) => logger.warn({ err }, 'Redis ready handler failed'));
    }
  });
  // ioredis emits an error on every reconnect attempt; log once per outage.
  client.on('error', (err) => {
    if (warned) return;
    warned = true;
    logger.warn({ err: err.message }, 'Redis unavailable; using MongoDB and in-memory fallbacks');
  });
}

// The client when it can take commands right now, else null.
export function redisClient() {
  return client?.status === 'ready' ? client : null;
}

export function onRedisReady(listener) {
  readyListeners.push(listener);
}

export async function disconnectRedis() {
  if (!client) return;
  const closing = client;
  client = null;
  await closing.quit().catch(() => closing.disconnect());
}
