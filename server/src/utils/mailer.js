import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

function createTransport() {
  if (env.MAIL_TRANSPORT === 'smtp') {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return nodemailer.createTransport({ jsonTransport: true });
}

const transport = createTransport();

// Single entry point for outgoing mail.
export const mailer = {
  // replyTo: where "Reply" in the recipient's mail app goes (e.g. a support ticket's sender).
  async send({ to, subject, text, replyTo }) {
    await transport.sendMail({ from: env.MAIL_FROM, to, subject, text, replyTo });
    if (env.MAIL_TRANSPORT === 'console') {
      logger.info({ to, subject, text }, 'Email (console transport, not sent)');
    }
  },
};

// Checks the SMTP login once at startup so a wrong app password shows up in the
// log right away instead of on the first sign-up. Never stops the server.
export async function verifyMailer() {
  if (env.MAIL_TRANSPORT !== 'smtp') return;
  try {
    await transport.verify();
    logger.info({ host: env.SMTP_HOST, user: env.SMTP_USER }, 'SMTP login OK');
  } catch (err) {
    logger.error(
      { err, host: env.SMTP_HOST, user: env.SMTP_USER },
      'SMTP login failed; emails will not be sent',
    );
  }
}

// Requests must not wait on (or fail because of) the mail server.
// Phase 4 moves this onto the BullMQ worker; callers stay the same.
export function deliverEmailInBackground(message) {
  mailer.send(message).catch((err) => {
    logger.error({ err, subject: message.subject }, 'Email delivery failed');
  });
}
