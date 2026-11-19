import sharp from 'sharp';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

// Cloudflare Workers AI, used only for "Create image" (FLUX). Chat and file
// analysis stay on Gemini. https://developers.cloudflare.com/workers-ai/

export const CLOUDFLARE_IMAGE_MODELS = {
  // FLUX.2 [klein] 4B: fast, cheap (~100 neurons a picture), up to 4 references.
  klein: '@cf/black-forest-labs/flux-2-klein-4b',
  // FLUX.2 [dev]: better, ~35× the cost, up to 4 references.
  dev: '@cf/black-forest-labs/flux-2-dev',
  // FLUX.1 [schnell]: text only; the fallback when FLUX.2 is down.
  schnell: '@cf/black-forest-labs/flux-1-schnell',
};
export const CLOUDFLARE_DEFAULT_IMAGE_MODEL = CLOUDFLARE_IMAGE_MODELS.klein;
// FLUX.2 takes at most 4 reference images, each under 512×512.
export const CLOUDFLARE_MAX_REFERENCES = 4;
const REF_MAX_SIDE = 511;

export class CloudflareError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'CloudflareError';
    this.status = status;
    this.code = code ?? null;
  }
}

export function isCloudflareConfigured() {
  return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN);
}

const isFlux2 = (model) => /flux-2/i.test(model);

// About one megapixel in the asked shape, in steps of 16 px (FLUX's grid).
export function sizeFor(aspectRatio = '1:1') {
  const [w, h] = aspectRatio.split(':').map(Number);
  const ratio = w > 0 && h > 0 ? w / h : 1;
  const snap = (value) => Math.min(1920, Math.max(256, Math.round(value / 16) * 16));
  return {
    width: snap(Math.sqrt(1024 * 1024 * ratio)),
    height: snap(Math.sqrt((1024 * 1024) / ratio)),
  };
}

// References are shrunk to fit FLUX.2's 512×512 limit and sent as JPEG.
async function toReference(buffer) {
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(REF_MAX_SIDE, REF_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function run(model, init, timeoutMs) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      ...init,
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`, ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new CloudflareError(
      error.name === 'TimeoutError' ? 504 : 502,
      `Cloudflare request failed: ${error.message}`,
    );
  }

  const type = response.headers.get('content-type') ?? '';
  // Some models (SDXL) answer with the picture itself.
  if (response.ok && type.startsWith('image/')) {
    return { mimeType: type.split(';')[0], data: Buffer.from(await response.arrayBuffer()) };
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    const first = body?.errors?.[0];
    throw new CloudflareError(
      response.ok ? 400 : response.status,
      first?.message ?? `Cloudflare answered ${response.status}`,
      first?.code,
    );
  }
  const image = body?.result?.image ?? body?.image;
  if (!image) throw new CloudflareError(422, 'Cloudflare returned no image');
  return { mimeType: 'image/jpeg', data: Buffer.from(image, 'base64') };
}

async function runFlux2(model, { prompt, references, width, height, timeoutMs }) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', String(width));
  form.append('height', String(height));
  for (const [index, buffer] of references.entries()) {
    form.append(
      `input_image_${index}`,
      new Blob([buffer], { type: 'image/jpeg' }),
      `ref-${index}.jpg`,
    );
  }
  // fetch sets the multipart boundary itself.
  return run(model, { body: form }, timeoutMs);
}

async function runSchnell(model, { prompt, timeoutMs }) {
  return run(
    model,
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 8 }),
    },
    timeoutMs,
  );
}

/**
 * One picture from Cloudflare FLUX.
 * references: image Buffers (any common format), at most 4.
 * Returns { images: [{ mimeType, data (base64) }], model }, like generateImage.
 */
export async function generateCloudflareImage({
  model = CLOUDFLARE_DEFAULT_IMAGE_MODEL,
  prompt,
  references = [],
  aspectRatio = '1:1',
  timeoutMs = 2 * 60 * 1000,
}) {
  if (!isCloudflareConfigured()) {
    throw new CloudflareError(503, 'Cloudflare Workers AI is not configured', 'NOT_CONFIGURED');
  }
  const { width, height } = sizeFor(aspectRatio);
  const refs = await Promise.all(
    references.slice(0, CLOUDFLARE_MAX_REFERENCES).map((buffer) => toReference(buffer)),
  );

  const attempt = (name) =>
    isFlux2(name)
      ? runFlux2(name, { prompt, references: refs, width, height, timeoutMs })
      : runSchnell(name, { prompt, timeoutMs });

  let image;
  let used = model;
  try {
    image = await attempt(model);
  } catch (error) {
    // Text-only pictures can fall back to FLUX.1 when FLUX.2 is having trouble.
    // Limits (429), refusals (400) and bad tokens (401/403) don't change by switching.
    const retryable =
      error instanceof CloudflareError && (error.status >= 500 || error.status === 404);
    if (!retryable || refs.length || model === CLOUDFLARE_IMAGE_MODELS.schnell) throw error;
    logger.warn(
      { err: error.message, model },
      'Cloudflare image model failed; trying FLUX.1 schnell',
    );
    used = CLOUDFLARE_IMAGE_MODELS.schnell;
    image = await attempt(used);
  }
  return {
    images: [{ mimeType: image.mimeType, data: image.data.toString('base64') }],
    text: '',
    model: used,
    totalTokens: 0,
  };
}
