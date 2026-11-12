import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { globalLimiter, uploadLimiter } from './middleware/rateLimit.js';
import uploadsRoutes from './modules/files/uploads.routes.js';
import { apiRouter } from './modules/index.js';
import { sendSuccess } from './utils/apiResponse.js';
import { logger } from './utils/logger.js';

const httpLogger = pinoHttp({
  logger,
  genReqId: () => randomUUID(),
  autoLogging: { ignore: (req) => req.url === '/api/health' },
});

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(httpLogger);
  app.use(helmet());
  // gzip JSON responses. Media never passes through the API: browsers fetch it from S3.
  app.use(compression());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());

  app.get('/api/health', (req, res) => sendSuccess(res, { status: 'ok' }));

  // Mounted ahead of the main router: uploads stream raw bytes and need their own rate limit.
  app.use('/api/uploads', uploadLimiter, csrfProtection, uploadsRoutes);

  app.use('/api', globalLimiter, csrfProtection, apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
