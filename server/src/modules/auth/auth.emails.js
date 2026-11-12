import { env } from '../../config/env.js';
import { APP_NAME, AUTH } from '../../config/constants.js';

export function verificationEmail({ to, name, token }) {
  const link = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: `Confirm your email for ${APP_NAME}`,
    text: [
      `Hi ${name},`,
      '',
      'Confirm your email address so we can reach you about invites, client reviews and billing:',
      link,
      '',
      `This link expires in ${AUTH.EMAIL_VERIFY_TTL_HOURS} hours. If you didn't create an account, you can ignore this email.`,
    ].join('\n'),
  };
}

export function passwordResetEmail({ to, name, token }) {
  const link = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: `Reset your ${APP_NAME} password`,
    text: [
      `Hi ${name},`,
      '',
      'Someone asked to reset the password for your account. If that was you, choose a new one here:',
      link,
      '',
      `This link expires in ${AUTH.PASSWORD_RESET_TTL_MINUTES} minutes and signs you out everywhere once used.`,
      "If you didn't ask for this, you can ignore this email. Your password won't change.",
    ].join('\n'),
  };
}
