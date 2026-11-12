import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { createApp } from './app.js';
import { startUploadSweeper, stopUploadSweeper } from './modules/files/directUploads.service.js';
import {
  startStorageReconciler,
  stopStorageReconciler,
} from './modules/files/storageReconcile.service.js';
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
    stopUploadSweeper();
    stopStorageReconciler();
    server.close(async () => {
      await Promise.all([disconnectDatabase(), disconnectRedis()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function start() {
  // Not awaited: the API starts (on MongoDB alone) even when Redis is down.
  connectRedis();
  await connectDatabase();
  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
  });
  // Node cuts off requests after 5 minutes by default; a multi-GB backup restore
  // is one long upload. File uploads go straight to S3 and are unaffected.
  server.requestTimeout = 60 * 60 * 1000;
  registerGracefulShutdown(server);
  startTranscriptWorker();
  startUploadSweeper();
  startStorageReconciler();
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
