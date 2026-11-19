import { logger } from '../../utils/logger.js';
import { sweepAlerts } from './alerts.service.js';

// Repeats project alerts nobody answered yet (every few minutes, as each
// person's settings say). Alerts are only made by people on purpose, so this
// runs in development too.

const TICK_MS = 30 * 1000;
let timer = null;
let running = false;

async function run() {
  if (running) return;
  running = true;
  try {
    const sent = await sweepAlerts();
    if (sent > 0) logger.info({ sent }, 'Project alert repeats sent');
  } catch (err) {
    logger.error({ err }, 'Project alert sweep failed');
  } finally {
    running = false;
  }
}

export function startAlertWorker() {
  logger.info('Project alert worker started');
  timer = setInterval(run, TICK_MS);
  timer.unref();
}

export function stopAlertWorker() {
  clearInterval(timer);
}
