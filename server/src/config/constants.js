export const APP_NAME = 'FrameDesk';

const GB = 1024 ** 3;

export const AUTH = Object.freeze({
  MAX_FAILED_LOGINS: 5,
  LOCK_MINUTES: 15,
  EMAIL_VERIFY_TTL_HOURS: 24,
  PASSWORD_RESET_TTL_MINUTES: 60,
});

export const TRIAL = Object.freeze({
  PLAN_CODE: 'starter',
  DAYS: 7,
  STORAGE_BYTES: 5 * GB,
});

export const BILLING = Object.freeze({
  // After a paid period ends, uploads keep working this long before the
  // workspace becomes read-only.
  GRACE_DAYS: 7,
  // The owner is emailed this many days before a paid period ends.
  REMIND_DAYS_BEFORE: 5,
});

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
