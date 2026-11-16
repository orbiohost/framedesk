import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { syncStaleAccounts } from './social.service.js';

// Keeps linked social accounts fresh without anyone pressing "Sync": every
// half hour, re-reads accounts not synced in the last 12 hours.
const TICK_MS = 30 * 60 * 1000;
const FIRST_TICK_AFTER_MS = 2 * 60 * 1000;

let timer = null;
let firstRun = null;
let running = false;

async function run() {
  if (running) return;
  running = true;
  try {
    const count = await syncStaleAccounts();
    if (count) logger.info({ count }, 'Social accounts synced');
  } catch (err) {
    logger.error({ err }, 'Social sync run failed');
  } finally {
    running = false;
  }
}

export function startSocialSyncWorker() {
  // Local dev shares the live database: leave background syncing to production.
  if (env.NODE_ENV !== 'production' && process.env.SOCIAL_SYNC_IN_DEV !== 'true') return;
  logger.info('Social sync worker started');
  firstRun = setTimeout(run, FIRST_TICK_AFTER_MS);
  firstRun.unref();
  timer = setInterval(run, TICK_MS);
  timer.unref();
}

export function stopSocialSyncWorker() {
  clearTimeout(firstRun);
  clearInterval(timer);
}
