import { readAccessToken } from '../modules/auth/auth.cookies.js';
import { resolveSessionUser } from '../modules/auth/session.service.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Like authenticate, but a visitor without a (valid) session simply goes on
// with req.user = null instead of getting a 401. Used by public share links.
export const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  req.user = null;
  const accessToken = readAccessToken(req);
  if (!accessToken) return next();

  try {
    const payload = verifyAccessToken(accessToken);
    req.user = await resolveSessionUser({ userId: payload.sub, sessionId: payload.sid });
    req.sessionId = payload.sid;
  } catch {
    req.user = null;
  }
  next();
});
