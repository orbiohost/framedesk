import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { findAvatar } from './avatars.service.js';

// Public: the key is random and changes with every new picture, so the
// response never changes and browsers may keep it for a year.
const router = Router();

router.get(
  '/:key',
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    const avatar = /^[A-Za-z0-9_-]{16,64}$/.test(key) ? await findAvatar(key) : null;
    if (!avatar) {
      res.status(404).end();
      return;
    }
    res.set({
      'Content-Type': avatar.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'",
    });
    res.send(Buffer.from(avatar.data.buffer ?? avatar.data));
  }),
);

export default router;
