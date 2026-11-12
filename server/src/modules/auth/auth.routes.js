import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authLimiter, emailLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from './auth.validation.js';

const router = Router();

router.get('/csrf', controller.getCsrfToken);

router.post('/signup', authLimiter, validate({ body: signupSchema }), controller.signup);
router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.post('/logout-all', authenticate, controller.logoutEverywhere);

router.post(
  '/verify-email',
  authLimiter,
  validate({ body: verifyEmailSchema }),
  controller.verifyEmail,
);
router.post('/verify-email/resend', authenticate, emailLimiter, controller.resendVerification);

router.post(
  '/forgot-password',
  emailLimiter,
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);
router.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);

export default router;
