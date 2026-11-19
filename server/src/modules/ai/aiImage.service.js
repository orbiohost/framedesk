import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storageConfig } from '../../config/storage.js';
import { getStorageDriver } from '../../storage/storageDriver.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { StoredFile } from '../files/file.model.js';
import { hiddenFolderIds } from '../files/folderAccess.js';
import { ingestFile } from '../files/fileIngest.js';
import { correctedMime } from '../files/fileTypes.js';
import { ensureDriveFolder } from '../files/folders.service.js';
import { findUsableAgent } from './aiAgents.service.js';
import {
  assertLive,
  citedFiles,
  findThreadOrThrow,
  noCreditsError,
  titleFrom,
  toMessageDto,
  toThreadSummary,
} from './aiChat.service.js';
import { AiThread, MAX_THREAD_MESSAGES } from './aiThread.model.js';
import { getAiSettings } from './aiSettings.service.js';
import { truncate } from './aiText.js';
import { creditBalance, creditsForTokens, resetPriceFor, spendCredits } from './credits.service.js';
import { generateImage, GeminiError, toAppError } from './gemini.client.js';
import { imageRoute, maxReferencesFor, resolveModel } from './aiModels.js';
import { CloudflareError, generateCloudflareImage } from './cloudflare.client.js';

// "Create image" in the AI chat: Gemini draws a picture from a prompt and up
// to N reference images (N depends on the plan), saved to the Drive folder
// "AI images" so it can be shared, downloaded or used in projects.

export const AI_IMAGES_FOLDER = 'AI images';
export const IMAGE_STYLES = {
  none: '',
  photo: 'Photorealistic photograph, natural light, sharp focus, realistic textures.',
  cinematic:
    'Cinematic film still, dramatic lighting, shallow depth of field, anamorphic look, colour graded.',
  illustration: 'Clean digital illustration, bold shapes, harmonious colours.',
  '3d': 'Polished 3D render, soft studio lighting, subtle shadows.',
  poster: 'Graphic poster design with strong typography and a clear focal point.',
  thumbnail:
    'Eye-catching YouTube thumbnail: high contrast, expressive subject, large readable text if any text is asked for.',
  logo: 'Simple flat vector logo mark on a plain background, minimal, scalable.',
};

const REF_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const REF_MAX_BYTES = 7 * 1024 * 1024;
const REF_TOTAL_BYTES = 18 * 1024 * 1024;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

async function readBase64(storageKey) {
  const chunks = [];
  for await (const chunk of getStorageDriver().readStream(storageKey)) chunks.push(chunk);
  return Buffer.concat(chunks).toString('base64');
}

// The plan's reference-image allowance.
export function refImageLimit(pool, settings) {
  return settings.refImageLimits[resetPriceFor(pool, settings)] ?? 3;
}

// Reference images: each must be an image the asker can open, small enough to send.
async function loadReferences(workspaceId, viewer, fileIds) {
  if (!fileIds.length) return [];
  const [hidden, files] = await Promise.all([
    hiddenFolderIds(workspaceId, viewer),
    StoredFile.find({ workspaceId, _id: { $in: fileIds }, deletedAt: null })
      .select('displayName extension category size mime storageKey folderId')
      .lean(),
  ]);
  const byId = new Map(
    files
      .filter((file) => !hidden.has(String(file.folderId)))
      .map((file) => [String(file._id), file]),
  );
  let total = 0;
  return fileIds.map((id) => {
    const file = byId.get(String(id));
    if (!file) {
      throw AppError.notFound(
        'A reference image was deleted or you can’t open it. Remove it and try again.',
        'FILE_NOT_FOUND',
      );
    }
    const mime = correctedMime(file.mime, file.extension);
    if (file.category !== 'image' || !REF_MIME.has(mime)) {
      throw AppError.badRequest(
        `${file.displayName} isn’t a PNG, JPEG, WebP or HEIC image, so it can’t be a reference.`,
        'REF_NOT_IMAGE',
      );
    }
    if (file.size > REF_MAX_BYTES) {
      throw AppError.badRequest(
        `${file.displayName} is larger than 7 MB. Use a smaller version as a reference.`,
        'REF_TOO_LARGE',
      );
    }
    total += file.size;
    if (total > REF_TOTAL_BYTES) {
      throw AppError.badRequest(
        'The reference images are too large together (18 MB at most).',
        'REF_TOO_LARGE',
      );
    }
    return { ...file, mime };
  });
}

// Writes the generated image into Drive ("AI images") as a normal file.
async function saveImage({ workspace, user }, image, prompt) {
  const mime = EXTENSIONS[image.mimeType] ? image.mimeType : 'image/png';
  const extension = EXTENSIONS[mime];
  const bytes = Buffer.from(image.data, 'base64');
  await fs.mkdir(storageConfig.stagingDir, { recursive: true });
  const localPath = path.join(storageConfig.stagingDir, `ai-image-${randomUUID()}.${extension}`);
  await fs.writeFile(localPath, bytes);
  let stored;
  try {
    stored = await ingestFile({
      workspaceId: workspace._id,
      localPath,
      size: bytes.length,
      extension,
    });
  } finally {
    await fs.rm(localPath, { force: true }).catch(() => {});
  }
  const folder = await ensureDriveFolder(workspace._id, AI_IMAGES_FOLDER, user._id);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const base =
    prompt
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(' ')
      .slice(0, 6)
      .join('-')
      .toLowerCase()
      .slice(0, 60) || 'ai-image';
  try {
    return await StoredFile.create({
      workspaceId: workspace._id,
      projectId: null,
      folderId: folder.id,
      displayName: `${base}-${stamp}.${extension}`,
      extension,
      category: 'image',
      storageKey: stored.storageKey,
      size: stored.size,
      mime: stored.mime,
      tags: ['ai-generated'],
      note: truncate(`AI image prompt: ${prompt}`, 2000),
      uploadedBy: user._id,
    });
  } catch (err) {
    await stored.undo();
    throw err;
  }
}

function promptText({ prompt, style, references, editing, agent }) {
  const lines = [];
  if (agent?.instructions) {
    lines.push(`Brand and style guidance from the team: ${truncate(agent.instructions, 1500)}`);
  }
  if (editing) {
    lines.push('Edit the previous image above as asked. Keep everything not mentioned the same.');
  } else if (references.length) {
    lines.push(
      `Use the ${references.length === 1 ? 'reference image' : `${references.length} reference images`} above as asked (subject, style, colours or composition). When the request doesn't say how, keep the main subject recognisable.`,
    );
  }
  if (IMAGE_STYLES[style]) lines.push(`Style: ${IMAGE_STYLES[style]}`);
  lines.push(`Request: ${prompt}`);
  lines.push('Create one high-quality image. Do not add watermarks or captions unless asked.');
  return lines.join('\n');
}

async function geminiImage({ prompt, style, references, editing, agent, engine, aspectRatio }) {
  const parts = [];
  for (const [index, file] of references.entries()) {
    parts.push({ text: `Reference image ${index + 1}: ${file.displayName}` });
    parts.push({ inlineData: { mimeType: file.mime, data: await readBase64(file.storageKey) } });
  }
  if (editing) {
    parts.push({ text: 'Previous image:' });
    parts.push({
      inlineData: { mimeType: editing.mime, data: await readBase64(editing.storageKey) },
    });
  }
  parts.push({ text: promptText({ prompt, style, references, editing, agent }) });
  return generateImage({ model: engine, parts, aspectRatio });
}

// FLUX reads one prompt; reference images are numbered from 0 ("image 0").
function fluxPrompt({ prompt, style, references, editing, agent }) {
  const lines = [prompt.trim()];
  if (editing) {
    lines.push('Edit image 0 as asked. Keep everything not mentioned the same.');
  } else if (references.length) {
    const names = references.map((file, index) => `image ${index} (${file.displayName})`);
    lines.push(
      `Use the reference ${references.length === 1 ? 'image' : 'images'} ${names.join(', ')} as asked: subject, style, colours or composition. Keep the main subject recognisable.`,
    );
  }
  if (IMAGE_STYLES[style]) lines.push(IMAGE_STYLES[style]);
  if (agent?.instructions) lines.push(`Brand style: ${truncate(agent.instructions, 300)}`);
  lines.push('High quality, no watermark.');
  return truncate(lines.join('\n'), 2000);
}

async function cloudflareImage({ prompt, style, references, editing, agent, engine, aspectRatio }) {
  const sources = editing ? [editing] : references;
  const buffers = await Promise.all(
    sources.map(async (file) => Buffer.from(await readBase64(file.storageKey), 'base64')),
  );
  return generateCloudflareImage({
    model: engine,
    prompt: fluxPrompt({ prompt, style, references, editing, agent }),
    references: buffers,
    aspectRatio,
  });
}

const BUSY_MESSAGE = 'Image creation is very busy right now. Please try again in a little while.';
const UNAVAILABLE_MESSAGE = 'Image creation isn’t available right now. Please try again later.';

// Provider errors as friendly messages. Setup and quota details are logged for
// the operator, never shown to the user.
function imageError(error, { provider, engine }) {
  if (error instanceof AppError) return error;
  const refused = () =>
    AppError.badRequest(
      'The AI couldn’t make that image (it may break the content rules). Try rewording the request.',
      'IMAGE_REFUSED',
    );
  const tooMany = (wait) =>
    AppError.tooManyRequests(
      `Too many image requests right now. Please try again in ${
        wait ? `${Math.ceil(Number(wait))} seconds` : 'a minute'
      }.`,
      'IMAGE_RATE_LIMIT',
    );

  if (error instanceof CloudflareError) {
    const text = error.message;
    // Out of today's free neurons (resets 00:00 UTC), or the account is limited.
    if (/neuron|daily free allocation|allocation|quota/i.test(text)) {
      logger.error({ err: text, engine }, 'Cloudflare Workers AI daily allowance used up');
      return new AppError(503, 'IMAGE_QUOTA', BUSY_MESSAGE);
    }
    if (error.status === 429) return tooMany();
    if (/nsfw|unsafe|flagged|safety|content policy/i.test(text)) return refused();
    if (error.status === 401 || error.status === 403 || error.code === 'NOT_CONFIGURED') {
      logger.error({ err: text }, 'Cloudflare Workers AI token or account ID is wrong');
      return AppError.unavailable(UNAVAILABLE_MESSAGE, 'IMAGE_UNAVAILABLE');
    }
    if (error.status === 422) {
      return AppError.badRequest(
        'The AI didn’t return an image this time. Try again or reword the request.',
        'IMAGE_REFUSED',
      );
    }
    if (/unsupported image|input image|decode|vips|heif/i.test(text)) {
      return AppError.badRequest(
        'One of the reference images couldn’t be read. Use PNG, JPG or WebP images.',
        'REF_UNREADABLE',
      );
    }
    logger.error({ err: text, status: error.status, engine }, 'Cloudflare image request failed');
    return error.status === 504
      ? new AppError(503, 'IMAGE_BUSY', BUSY_MESSAGE)
      : AppError.unavailable(UNAVAILABLE_MESSAGE, 'IMAGE_UNAVAILABLE');
  }

  // sharp couldn't read a reference (e.g. HEIC) before anything was sent.
  if (
    provider === 'cloudflare' &&
    /input|unsupported image format|heif|vips/i.test(error.message)
  ) {
    return AppError.badRequest(
      'One of the reference images couldn’t be read. Use PNG, JPG or WebP images.',
      'REF_UNREADABLE',
    );
  }

  if (error instanceof GeminiError && error.status === 422) return refused();
  if (error instanceof GeminiError && error.status === 429) {
    // "limit: 0" on the free tier: the key has no image quota until billing is on.
    if (/limit:\s*0\b|free[_ ]tier/i.test(error.message)) {
      logger.error(
        { err: error.message },
        'Gemini key has no image quota (free tier): turn on billing in Google AI Studio',
      );
      return new AppError(503, 'IMAGE_QUOTA', BUSY_MESSAGE);
    }
    return tooMany(error.message.match(/retry in ([\d.]+)s/i)?.[1]);
  }
  if (error instanceof GeminiError && (error.status === 404 || error.status === 400)) {
    logger.error({ err: error.message, model: engine }, 'Image model rejected');
    return AppError.unavailable(UNAVAILABLE_MESSAGE, 'IMAGE_UNAVAILABLE');
  }
  return toAppError(error);
}

/**
 * Makes an image for a chat. threadId null starts a new chat.
 * referenceFileIds: Drive images to work from (up to the plan's limit).
 * Returns the same shape as a chat answer: { thread, messages, files, credits }.
 */
export async function createImage(
  { workspace, pool, user, viewer },
  {
    threadId,
    prompt,
    referenceFileIds = [],
    aspectRatio = '1:1',
    style = 'none',
    agentId = null,
    modelKey = null,
  },
) {
  const settings = await getAiSettings();
  assertLive(settings, pool);
  const chosen = resolveModel(settings, 'image', modelKey);
  const multiplier = chosen?.creditMultiplier ?? 1;
  // Pictures run on Cloudflare FLUX (or Gemini, per the admin); chat stays on Gemini.
  const { provider, engine, fellBack } = imageRoute(settings, chosen);
  if (fellBack) {
    logger.warn('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_AI_TOKEN not set: images fall back to Gemini');
  }
  const cost = Math.max(1, Math.ceil(settings.imageCredits * multiplier));
  // Any credits left are enough: the last picture uses up what remains
  // (spendCredits charges at most the balance), like a chat answer does.
  const balance = creditBalance(pool, settings);
  if (balance.total < 1) throw noCreditsError(balance);

  const limit = maxReferencesFor(settings, chosen, refImageLimit(pool, settings));
  const refIds = [...new Set(referenceFileIds.map(String))];
  if (refIds.length > limit) {
    throw new AppError(
      403,
      'REF_LIMIT',
      limit === 0
        ? 'Your plan can’t use reference images. Upgrade to add them.'
        : `Your plan allows up to ${limit} reference ${limit === 1 ? 'image' : 'images'} per request. Remove some, or upgrade for more.`,
      { limit },
    );
  }

  const existing = threadId ? await findThreadOrThrow(workspace, user, threadId) : null;
  const agent = await findUsableAgent(
    workspace._id,
    user._id,
    existing ? existing.agentId : agentId,
  );
  const references = await loadReferences(workspace._id, viewer, refIds);

  // No new references in an image chat: the last picture is edited ("make it bluer").
  let editing = null;
  if (!references.length && existing) {
    const lastImageId = existing.messages
      .findLast((message) => message.images?.length)
      ?.images.at(-1);
    if (lastImageId) {
      const [previous] = await loadReferences(workspace._id, viewer, [lastImageId]).catch(() => []);
      editing = previous ?? null;
    }
  }

  let result;
  try {
    result =
      provider === 'cloudflare'
        ? await cloudflareImage({ prompt, style, references, editing, agent, engine, aspectRatio })
        : await geminiImage({ prompt, style, references, editing, agent, engine, aspectRatio });
  } catch (error) {
    throw imageError(error, { provider, engine });
  }

  const file = await saveImage({ workspace, user }, result.images[0], prompt);
  const credits = Math.max(
    cost,
    Math.ceil(creditsForTokens(result.totalTokens, settings, 0) * multiplier),
  );
  const { spent, balance: after } = await spendCredits(pool._id, credits, {
    kind: 'image',
    userId: user._id,
    usedInWorkspaceId: workspace._id,
    tokens: result.totalTokens,
    note: truncate(`Image: ${prompt}`, 200),
  });

  const thread =
    existing ??
    (
      await AiThread.create({
        workspaceId: workspace._id,
        userId: user._id,
        title: titleFrom(prompt),
        agentId: agent?._id ?? null,
        agentName: agent?.name ?? null,
        messages: [],
      })
    ).toObject();
  const now = new Date();
  const userMessage = {
    role: 'user',
    kind: 'image',
    text: truncate(prompt, 20_000),
    attachments: references.map((ref) => ({
      fileId: ref._id,
      name: truncate(ref.displayName, 200),
      category: 'image',
    })),
    imageOptions: { aspectRatio, style },
    createdAt: now,
  };
  const modelMessage = {
    role: 'model',
    kind: 'image',
    text: truncate(result.text || 'Here’s your image. Saved to Drive → AI images.', 20_000),
    fileIds: [file._id],
    images: [file._id],
    credits: spent,
    modelName: chosen?.name ?? null,
    createdAt: new Date(now.getTime() + 1),
  };
  const saved = await AiThread.findOneAndUpdate(
    { _id: thread._id, workspaceId: workspace._id, userId: user._id },
    {
      $push: { messages: { $each: [userMessage, modelMessage], $slice: -MAX_THREAD_MESSAGES } },
      $set: { lastMessageAt: modelMessage.createdAt },
    },
    { new: true },
  ).lean();
  const [savedUser, savedModel] = saved.messages.slice(-2);
  return {
    thread: toThreadSummary(saved),
    created: !existing,
    messages: [toMessageDto(savedUser), toMessageDto(savedModel)],
    files: await citedFiles(workspace._id, [file._id], viewer),
    credits: after,
  };
}
