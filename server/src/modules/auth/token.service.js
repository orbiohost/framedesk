import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const JWT_OPTIONS = { issuer: 'framedesk-api', audience: 'framedesk-app' };

export function signAccessToken({ userId, sessionId }) {
  return jwt.sign({ sid: sessionId }, env.JWT_ACCESS_SECRET, {
    ...JWT_OPTIONS,
    subject: String(userId),
    algorithm: 'HS256',
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

// Throws jsonwebtoken errors; the central error handler maps them to 401.
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { ...JWT_OPTIONS, algorithms: ['HS256'] });
}
