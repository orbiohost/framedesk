import { AppError } from '../../utils/AppError.js';
import { CLOUDFLARE_DEFAULT_IMAGE_MODEL, isCloudflareConfigured } from './cloudflare.client.js';

// The AI models people pick from, under FrameDesk's own names. Each name runs
// on a provider + engine that only the admin sees, so either can change later
// without anyone's chats or habits changing.
//
// provider: chat models always run on Gemini (chat and file analysis). Image
// models run on Cloudflare Workers AI (FLUX, free daily allowance) or Gemini.
//
// status: 'available' (selectable), 'soon' (shown with a "Coming soon" badge,
// not selectable) or 'hidden' (not shown at all).

export const MODEL_KINDS = ['chat', 'image'];
export const MODEL_STATUSES = ['available', 'soon', 'hidden'];
export const IMAGE_PROVIDERS = ['cloudflare', 'gemini'];
// Most reference images each provider takes in one request.
export const PROVIDER_MAX_REFERENCES = { cloudflare: 4, gemini: 14 };

export const MODEL_CATALOG = [
  {
    key: 'frame-spark',
    kind: 'chat',
    name: 'Frame Spark',
    tagline: 'Fast and smart for everyday work',
    badge: null,
    provider: 'gemini',
    // null engine: use the admin's main chat model (settings.model).
    engine: null,
    creditMultiplier: 1,
    status: 'available',
  },
  {
    key: 'frame-ultra',
    kind: 'chat',
    name: 'Frame Ultra',
    tagline: 'Deeper thinking for scripts, strategy and long briefs',
    badge: 'Pro',
    provider: 'gemini',
    engine: 'gemini-3-pro',
    creditMultiplier: 4,
    status: 'soon',
  },
  {
    key: 'frame-canvas',
    kind: 'image',
    name: 'Frame Canvas',
    tagline: 'Quick pictures, thumbnails and edits',
    badge: null,
    // Free FLUX.2 [klein] on Cloudflare. null engine: the provider's default
    // (FLUX.2 klein on Cloudflare, settings.imageModel on Gemini).
    provider: 'cloudflare',
    engine: null,
    // Cloudflare FLUX costs next to nothing: 0.4 × 5 = 2 credits a picture.
    creditMultiplier: 0.4,
    status: 'available',
  },
  {
    key: 'frame-canvas-ultra',
    kind: 'image',
    name: 'Frame Canvas Ultra',
    tagline: 'Studio-quality images with sharp text and more references',
    badge: 'Pro',
    // Google's paid image model, for when billing is on.
    provider: 'gemini',
    engine: 'gemini-3-pro-image',
    creditMultiplier: 3,
    status: 'soon',
  },
];

const CATALOG_KEYS = new Set(MODEL_CATALOG.map((model) => model.key));

export function isModelKey(key) {
  return CATALOG_KEYS.has(key);
}

const clean = (value, max) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

// The catalog with the admin's changes (names, status, engine, price) applied.
export function modelsFrom(saved = {}) {
  return MODEL_CATALOG.map((base) => {
    const over = saved?.[base.key] ?? {};
    const multiplier = Number(over.creditMultiplier);
    return {
      ...base,
      name: clean(over.name, 40) ?? base.name,
      tagline: clean(over.tagline, 120) ?? base.tagline,
      badge: over.badge === '' ? null : (clean(over.badge, 12) ?? base.badge),
      engine: over.engine === '' ? null : (clean(over.engine, 80) ?? base.engine),
      // Only image models can switch provider.
      provider:
        base.kind === 'image' && IMAGE_PROVIDERS.includes(over.provider)
          ? over.provider
          : base.provider,
      status: MODEL_STATUSES.includes(over.status) ? over.status : base.status,
      creditMultiplier:
        Number.isFinite(multiplier) && multiplier >= 0.1 && multiplier <= 20
          ? multiplier
          : base.creditMultiplier,
    };
  });
}

// What the app shows: no engines, nothing hidden.
export function publicModels(settings) {
  return settings.models
    .filter((model) => model.status !== 'hidden')
    .map(({ key, kind, name, tagline, badge, status, creditMultiplier }) => ({
      key,
      kind,
      name,
      tagline,
      badge,
      status,
      creditMultiplier,
    }));
}

export function defaultModel(settings, kind) {
  return (
    settings.models.find((model) => model.kind === kind && model.status === 'available') ?? null
  );
}

// The model a request runs on. No key means the default; a model that isn't
// open yet is refused with a friendly message.
export function resolveModel(settings, kind, key) {
  const fallback = defaultModel(settings, kind);
  if (!key) return fallback;
  const model = settings.models.find((entry) => entry.key === key && entry.kind === kind);
  if (!model || model.status === 'hidden') return fallback;
  if (model.status !== 'available') {
    throw new AppError(
      403,
      'MODEL_COMING_SOON',
      `${model.name} is coming soon. Switch to ${fallback?.name ?? 'another model'} for now.`,
    );
  }
  return model;
}

// What gets saved: the editable fields of each model, keyed by model key.
// Accepts the full list (as settings hold it) or an object keyed by key.
export function modelOverrides(models) {
  const list = Array.isArray(models)
    ? models
    : Object.entries(models ?? {}).map(([key, value]) => ({ ...value, key }));
  return Object.fromEntries(
    modelsFrom(Object.fromEntries(list.map((model) => [model.key, model]))).map(
      ({ key, name, tagline, badge, status, provider, engine, creditMultiplier }) => [
        key,
        {
          name,
          tagline,
          badge: badge ?? '',
          status,
          provider,
          engine: engine ?? '',
          creditMultiplier,
        },
      ],
    ),
  );
}

// Where an image model really runs: its provider and engine. A Cloudflare model
// falls back to Gemini while the Cloudflare keys aren't set.
export function imageRoute(settings, model) {
  const wanted = model?.provider ?? 'gemini';
  const provider = wanted === 'cloudflare' && !isCloudflareConfigured() ? 'gemini' : wanted;
  const engine =
    provider === wanted && model?.engine
      ? model.engine
      : provider === 'cloudflare'
        ? CLOUDFLARE_DEFAULT_IMAGE_MODEL
        : settings.imageModel;
  return { provider, engine, fellBack: provider !== wanted };
}

// Reference images one request may carry: the plan's allowance, capped by what
// the model's provider takes.
export function maxReferencesFor(settings, model, planLimit) {
  return Math.min(planLimit, PROVIDER_MAX_REFERENCES[imageRoute(settings, model).provider] ?? 4);
}
