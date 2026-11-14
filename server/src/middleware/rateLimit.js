import { MemoryStore, rateLimit } from 'express-rate-limit';
import { redisClient } from '../config/redis.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Counts in Redis when it is connected, so limits are shared by every API
// instance and survive restarts. While Redis is down, counts fall back to this
// process's memory, so limits keep working, just per instance.
class RedisWithMemoryFallbackStore {
  constructor(name) {
    this.prefix = `fd:rl:${name}:`;
    this.localKeys = false;
    this.memory = new MemoryStore();
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  async withRedis(action, fallback) {
    const redis = redisClient();
    if (redis) {
      try {
        return await action(redis);
      } catch (err) {
        logger.debug({ err: err.message }, 'Rate limit store fell back to memory');
      }
    }
    return fallback();
  }

  increment(key) {
    return this.withRedis(
      async (redis) => {
        const [totalHits, ttl] = await redis.rateLimitHit(this.prefix + key, this.windowMs);
        return { totalHits, resetTime: new Date(Date.now() + ttl) };
      },
      () => this.memory.increment(key),
    );
  }

  decrement(key) {
    return this.withRedis(
      (redis) => redis.decr(this.prefix + key),
      () => this.memory.decrement(key),
    );
  }

  async resetKey(key) {
    await this.memory.resetKey(key);
    await this.withRedis(
      (redis) => redis.del(this.prefix + key),
      () => {},
    );
  }
}

function createLimiter({ name, windowMs, limit, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    ...(keyGenerator && { keyGenerator }),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisWithMemoryFallbackStore(name),
    handler: (req, res, next) => next(AppError.tooManyRequests(message)),
  });
}

export const globalLimiter = createLimiter({
  name: 'global',
  windowMs: FIFTEEN_MINUTES,
  limit: 600,
});

export const authLimiter = createLimiter({
  name: 'auth',
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  message: 'Too many attempts. Please wait 15 minutes and try again.',
});

export const emailLimiter = createLimiter({
  name: 'email',
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  message: 'Too many emails requested. Please wait a few minutes.',
});

// One large upload is many chunk requests, and scrubbing a video is many range
// requests, so these get their own, roomier budgets instead of the global one.
export const uploadLimiter = createLimiter({
  name: 'upload',
  windowMs: FIFTEEN_MINUTES,
  limit: 3000,
});

// Support tickets email the team, so a burst is almost certainly a script.
export const supportLimiter = createLimiter({
  name: 'support',
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  message: 'You have sent several requests in a short time. Please wait a few minutes.',
});

// Every checkout opens an order at Razorpay; real buyers need a handful at most.
export const checkoutLimiter = createLimiter({
  name: 'checkout',
  windowMs: FIFTEEN_MINUTES,
  limit: 15,
  message: 'Too many checkout attempts. Please wait a few minutes and try again.',
});

// Each question is a Gemini call over the whole file library.
export const aiChatLimiter = createLimiter({
  name: 'ai-chat',
  windowMs: FIFTEEN_MINUTES,
  limit: 60,
  message: 'Too many questions in a short time. Please wait a few minutes.',
});

// Each dictated note runs the speech model, so keep it to a sensible pace.
export const dictationLimiter = createLimiter({
  name: 'dictation',
  windowMs: FIFTEEN_MINUTES,
  limit: 60,
  message: 'Too many recordings in a short time. Please wait a few minutes.',
});

// OAuth sign-in for AI connectors (registration, token exchange). Calls come
// from the assistants' servers, so each IP stands for many people.
export const oauthLimiter = createLimiter({
  name: 'oauth',
  windowMs: FIFTEEN_MINUTES,
  limit: 600,
});

// AI connector tool calls, counted per connection rather than per IP: every
// Claude or ChatGPT user reaches us from the same few addresses.
export const mcpLimiter = createLimiter({
  name: 'mcp',
  windowMs: FIFTEEN_MINUTES,
  limit: 1200,
  message: 'Too many requests from this AI connection. Please wait a few minutes.',
  keyGenerator: (req) => `grant:${req.connector?.grant?._id ?? req.ip}`,
});
