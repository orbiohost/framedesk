import 'dotenv/config';
import { z } from 'zod';

function booleanString(defaultValue) {
  return z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    MONGODB_URI: z.string().min(1, 'is required'),
    CLIENT_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    COOKIE_SECURE: booleanString('true'),
    COOKIE_DOMAIN: z
      .string()
      .optional()
      .transform((value) => value || undefined),

    MAIL_TRANSPORT: z.enum(['smtp', 'console']).default('console'),
    MAIL_FROM: z.string().min(1, 'is required'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    // Google shows app passwords in groups ("abcd efgh ijkl mnop"); the spaces aren't part of it.
    SMTP_PASS: z
      .string()
      .optional()
      .transform((value) => value?.replace(/s+/g, '')),

    // Uploaded files live in an Amazon S3 bucket (or any S3-compatible store
    // such as R2 or MinIO, through S3_ENDPOINT).
    S3_BUCKET: z.string().min(1, 'is required'),
    S3_REGION: z.string().min(1, 'is required'),
    // Only for S3-compatible stores (R2, MinIO, Wasabi...). Leave empty for AWS.
    S3_ENDPOINT: z
      .string()
      .optional()
      .transform((value) => value || undefined)
      .pipe(z.string().url().optional()),
    S3_FORCE_PATH_STYLE: booleanString('false'),
    // Leave both empty to use the AWS default chain (an IAM role, ~/.aws, ...).
    S3_ACCESS_KEY_ID: z
      .string()
      .optional()
      .transform((value) => value || undefined),
    S3_SECRET_ACCESS_KEY: z
      .string()
      .optional()
      .transform((value) => value || undefined),
    // Optional folder inside the bucket, e.g. "framedesk/" to share a bucket.
    S3_KEY_PREFIX: z
      .string()
      .optional()
      .transform((value) => value || '')
      .pipe(
        z.string().regex(/^([\w.-]+\/)*$/, 'must be empty or look like framedesk/ (ending in /)'),
      ),

    // Unfinished (resumable) uploads wait here until they are pushed to the bucket.
    // Relative paths resolve against the server folder.
    UPLOAD_STAGING_DIR: z.string().min(1).default('./data/upload-staging'),
    MAX_UPLOAD_GB: z.coerce.number().positive().default(20),
    // Largest backup zip that can be uploaded for a restore, in GB.
    MAX_RESTORE_GB: z.coerce.number().positive().default(100),
    // Signs short-lived download links. Falls back to a key derived from JWT_ACCESS_SECRET.
    FILE_URL_SECRET: z
      .string()
      .optional()
      .transform((value) => value || undefined)
      .pipe(z.string().min(32, 'must be at least 32 characters').optional()),
    // Speech-to-text service (the "whisper" container). Leave empty to turn
    // transcripts and dictation off.
    WHISPER_URL: z
      .string()
      .optional()
      .transform((value) => value || undefined)
      .pipe(z.string().url().optional()),
    WHISPER_API_KEY: z
      .string()
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_SECRET_ACCESS_KEY'],
        message: 'set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither',
      });
    }
    if (env.WHISPER_URL && (env.WHISPER_API_KEY?.length ?? 0) < 24) {
      ctx.addIssue({
        code: 'custom',
        path: ['WHISPER_API_KEY'],
        message: 'must be at least 24 characters when WHISPER_URL is set',
      });
    }
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'is required when MAIL_TRANSPORT=smtp',
      });
    }
    if (env.MAIL_TRANSPORT === 'smtp' && env.SMTP_HOST && (!env.SMTP_USER || !env.SMTP_PASS)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.SMTP_USER ? 'SMTP_PASS' : 'SMTP_USER'],
        message:
          'is required when MAIL_TRANSPORT=smtp (for Gmail: your address and a Google app password)',
      });
    }
    if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
    if (env.NODE_ENV === 'production' && env.MAIL_TRANSPORT !== 'smtp') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_TRANSPORT'],
        message: 'must be smtp in production',
      });
    }
  });

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return Object.freeze(result.data);
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
