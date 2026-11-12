import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';
import { env } from '../../config/env.js';
import { storageConfig } from '../../config/storage.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { verifiedUploadMetadata } from './uploadContext.js';
import { finalizeUpload } from './uploads.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Unfinished uploads sit here (outside the storage folder) until they complete.
// Each can be resumed for a day after its last chunk.
export const uploadStore = new FileStore({
  directory: storageConfig.stagingDir,
  expirationPeriodInMilliseconds: DAY_MS,
});

// tus hooks report failures as { status_code, body }; send the same JSON shape as the rest of the API.
function toTusError(err) {
  const appError = err instanceof AppError ? err : null;
  if (!appError) logger.error({ err }, 'Upload could not be finalised');
  const statusCode = appError?.statusCode ?? 500;
  const error = {
    code: appError?.code ?? 'UPLOAD_FAILED',
    message: appError?.message ?? 'The upload could not be saved. Please try again.',
  };
  return { status_code: statusCode, body: JSON.stringify({ success: false, error }) };
}

export const uploadServer = new Server({
  path: '/api/uploads',
  datastore: uploadStore,
  maxSize: storageConfig.maxUploadBytes,
  relativeLocation: true,
  respectForwardedHeaders: env.TRUST_PROXY > 0,
  // Replace whatever the client sent with the metadata the server checked.
  async onUploadCreate() {
    const metadata = verifiedUploadMetadata.getStore();
    if (!metadata) throw toTusError(AppError.forbidden('Upload was not authorised'));
    return { metadata };
  },
  async onUploadFinish(req, upload) {
    try {
      await finalizeUpload(upload);
      return {};
    } catch (err) {
      throw toTusError(err);
    }
  },
});
