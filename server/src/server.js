import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';
import {
  startTranscriptWorker,
  stopTranscriptWorker,
} from './modules/transcripts/transcriptWorker.js';
import { logger } from './utils/logger.js';
import { verifyMailer } from './utils/mailer.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function registerGracefulShutdown(server) {
  function shutdown(signal) {
    logger.info({ signal }, 'Shutting down');
    stopTranscriptWorker();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function start() {
  await connectDatabase();
  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
  });
  // Node cuts off requests after 5 minutes by default; a multi-GB backup restore
  // is one long upload. Resumable file uploads are chunked and unaffected.
  server.requestTimeout = 60 * 60 * 1000;
  registerGracefulShutdown(server);
  startTranscriptWorker();
  verifyMailer();
}

process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'Unhandled promise rejection');
  process.exit(1);
});

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
