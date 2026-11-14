import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireCaptcha } from '../../middleware/captcha.js';
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
router.get('/providers', controller.getProviders);

// "Continue with Google": a full-page redirect out and back. Only the start
// counts toward the limit; the callback is bound to its one-time state.
router.get('/google', authLimiter, controller.startGoogle);
router.get('/google/callback', controller.googleCallback);

router.post('/signup', authLimiter, requireCaptcha, validate({ body: signupSchema }), controller.signup);
router.post('/login', authLimiter, requireCaptcha, validate({ body: loginSchema }), controller.login);
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
  requireCaptcha,
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
