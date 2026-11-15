export const APP_NAME = 'FrameDesk';

const GB = 1024 ** 3;

export const AUTH = Object.freeze({
  MAX_FAILED_LOGINS: 5,
  LOCK_MINUTES: 15,
  EMAIL_VERIFY_TTL_HOURS: 24,
  PASSWORD_RESET_TTL_MINUTES: 60,
});

// Every account starts on the free plan and stays on it until it pays for one,
// and falls back to it when a paid plan runs out. There is no trial any more;
// workspaces still "trialing" from before keep it until it ends, then go free.
export const FREE_PLAN = Object.freeze({
  PLAN_CODE: 'free',
  NAME: 'Free',
  STORAGE_GB: 2,
  STORAGE_BYTES: 2 * GB,
});

export const BILLING = Object.freeze({
  // After a paid period ends, uploads keep working this long before the
  // workspace becomes read-only.
  GRACE_DAYS: 7,
  // The owner is emailed this many days before a paid period ends.
  REMIND_DAYS_BEFORE: 5,
});

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
