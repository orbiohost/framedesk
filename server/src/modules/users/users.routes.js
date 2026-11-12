import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';
import { changePasswordSchema, setAvatarSchema, updateProfileSchema } from './users.validation.js';

const router = Router();

router.use(authenticate);

router.get('/me', controller.getMe);
router.patch('/me', validate({ body: updateProfileSchema }), controller.updateMe);
router.put('/me/avatar', validate({ body: setAvatarSchema }), controller.setAvatar);
router.delete('/me/avatar', controller.clearAvatar);
router.post(
  '/me/password',
  authLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

export default router;
