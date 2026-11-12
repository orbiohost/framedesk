import { readAccessToken } from '../modules/auth/auth.cookies.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import { resolveSessionUser } from '../modules/auth/session.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const accessToken = readAccessToken(req);
  if (!accessToken) throw AppError.unauthorized();

  const payload = verifyAccessToken(accessToken);
  req.user = await resolveSessionUser({ userId: payload.sub, sessionId: payload.sid });
  req.sessionId = payload.sid;
  next();
});
