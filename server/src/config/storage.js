import { createHmac } from 'node:crypto';
import path from 'node:path';
import { env } from './env.js';

const GB = 1024 ** 3;

export const storageConfig = Object.freeze({
  s3: Object.freeze({
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    keyPrefix: env.S3_KEY_PREFIX,
  }),
  stagingDir: path.resolve(env.UPLOAD_STAGING_DIR),
  maxUploadBytes: Math.floor(env.MAX_UPLOAD_GB * GB),
  maxRestoreBytes: Math.floor(env.MAX_RESTORE_GB * GB),
  urlSecret: env.FILE_URL_SECRET ?? deriveKey(env.JWT_ACCESS_SECRET, 'file-urls'),
  signedUrlTtlSeconds: 15 * 60,
});

// A separate key per purpose, so a leaked download link reveals nothing about session tokens.
function deriveKey(secret, purpose) {
  return createHmac('sha256', secret).update(purpose).digest('base64url');
}
