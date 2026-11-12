import { rateLimit } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// In-memory store: correct for a single API instance. When running several
// instances, switch to a shared Redis store (see README, "Scaling").
function createLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(AppError.tooManyRequests(message)),
  });
}

export const globalLimiter = createLimiter({ windowMs: FIFTEEN_MINUTES, limit: 600 });

export const authLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  message: 'Too many attempts. Please wait 15 minutes and try again.',
});

export const emailLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  message: 'Too many emails requested. Please wait a few minutes.',
});

// One large upload is many chunk requests, and scrubbing a video is many range
// requests, so these get their own, roomier budgets instead of the global one.
export const uploadLimiter = createLimiter({ windowMs: FIFTEEN_MINUTES, limit: 3000 });

// Each dictated note runs the speech model, so keep it to a sensible pace.
export const dictationLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: 60,
  message: 'Too many recordings in a short time. Please wait a few minutes.',
});
