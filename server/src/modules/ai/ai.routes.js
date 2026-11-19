import { Router } from 'express';
import { z } from 'zod';
import { aiChatLimiter } from '../../middleware/rateLimit.js';
import { canAdminister, canEdit, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logger } from '../../utils/logger.js';
import { objectId } from '../../utils/zodHelpers.js';
import { viewerOf } from '../files/folderAccess.js';
import { MAX_NOTE_PROJECTS, NOTE_VISIBILITIES } from '../quickNotes/quickNote.model.js';
import {
  deleteThread,
  getAiStatus,
  getThread,
  getUploadFolder,
  listThreads,
  MAX_ATTACHED,
  MAX_NOTES,
  renameThread,
  saveAnswerAsNote,
  searchFiles,
  streamAnswer,
} from './aiChat.service.js';
import { listLedger } from './credits.service.js';
import aiStudioRoutes from './aiStudio.routes.js';
import { createImage, IMAGE_STYLES } from './aiImage.service.js';
import { IMAGE_ASPECT_RATIOS } from './gemini.client.js';
import { MAX_REF_IMAGES } from './aiSettings.service.js';
import { isSkillId, MAX_SKILLS_PER_QUESTION } from './aiSkills.service.js';

// Mounted at /workspaces/:workspaceId/ai.
const router = Router();

// Custom assistants, skills and memory.
router.use(aiStudioRoutes);

const askSchema = z.object({
  text: z.string().trim().min(1, 'Type a question').max(4000),
  // Which chat this belongs to; leave out to start a new one.
  threadId: objectId.optional(),
  // Set by picking a project with "/": only that project's files are used.
  projectId: objectId.optional(),
  // Set by typing "//": the whole Drive is read for this question (footage
  // suggestions for a script, etc.). Without it (and no project or files),
  // the Drive is only used when the question names something in it.
  wholeDrive: z.boolean().optional(),
  // Text the question is about: a passage picked in an answer, or a whole
  // earlier answer a new chat was started from.
  quote: z.string().trim().max(12000).optional(),
  // Files attached with "@" or uploaded in the chat.
  fileIds: z.array(objectId).max(MAX_ATTACHED, `Attach up to ${MAX_ATTACHED} files`).optional(),
  // Saved notes added with "#".
  noteIds: z.array(objectId).max(MAX_NOTES, `Add up to ${MAX_NOTES} notes`).optional(),
  // A custom assistant to ask (new chats only; a chat keeps its assistant).
  agentId: objectId.optional(),
  // Skills picked with "!".
  skillIds: z
    .array(z.string().trim().refine(isSkillId, 'Unknown skill'))
    .max(MAX_SKILLS_PER_QUESTION, `Pick up to ${MAX_SKILLS_PER_QUESTION} skills`)
    .optional(),
  // The FrameDesk model to answer with; leave out for the default.
  modelKey: z.string().trim().max(40).optional(),
});
const messageParams = z.object({ threadId: objectId, messageId: objectId });
const saveNoteSchema = z.object({
  title: z.string().trim().max(160).optional(),
  projectIds: z
    .array(objectId)
    .max(MAX_NOTE_PROJECTS, `Link at most ${MAX_NOTE_PROJECTS} projects`)
    .transform((ids) => [...new Set(ids)])
    .optional(),
  visibility: z.enum(NOTE_VISIBILITIES).optional(),
});
const filesQuery = z.object({
  q: z.string().trim().max(120).optional(),
  projectId: objectId.optional(),
});
const threadParam = z.object({ threadId: objectId });
const renameSchema = z.object({ title: z.string().trim().min(1).max(120) });
const historyQuery = z.object({ cursor: objectId.optional() });

function context(req) {
  return { workspace: req.workspace, pool: req.storagePool, user: req.user, viewer: viewerOf(req) };
}

router.get(
  '/status',
  canView,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { status: await getAiStatus(context(req)) });
  }),
);

router.get(
  '/threads',
  canView,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { threads: await listThreads(context(req)) });
  }),
);

router.get(
  '/threads/:threadId',
  canView,
  validate({ params: threadParam }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getThread(context(req), req.params.threadId));
  }),
);

router.patch(
  '/threads/:threadId',
  canView,
  validate({ params: threadParam, body: renameSchema }),
  asyncHandler(async (req, res) => {
    await renameThread(context(req), req.params.threadId, req.body);
    sendSuccess(res, { renamed: true });
  }),
);

router.delete(
  '/threads/:threadId',
  canView,
  validate({ params: threadParam }),
  asyncHandler(async (req, res) => {
    await deleteThread(context(req), req.params.threadId);
    sendSuccess(res, { deleted: true });
  }),
);

// "Save to notes" on an answer: makes a quick note that links back to the chat.
router.post(
  '/threads/:threadId/messages/:messageId/note',
  canView,
  validate({ params: messageParams, body: saveNoteSchema }),
  asyncHandler(async (req, res) => {
    const note = await saveAnswerAsNote(
      context(req),
      req.params.threadId,
      req.params.messageId,
      req.body,
    );
    sendSuccess(res, { note }, { status: 201 });
  }),
);

// The "@" picker: files to attach to a question.
router.get(
  '/files',
  canView,
  validate({ query: filesQuery }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { files: await searchFiles(context(req), req.query) });
  }),
);

// Where files uploaded in the chat are stored (a Drive folder, made on first use).
router.post(
  '/upload-folder',
  canEdit,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { folder: await getUploadFolder(context(req)) });
  }),
);

// The answer streams back as server-sent events, so words appear as they are
// written: event "thread", then "status"/"delta" events, then "done" (or "error").
router.post('/ask', aiChatLimiter, canView, validate({ body: askSchema }), async (req, res) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    // no-transform keeps compression() from buffering the stream.
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tells nginx (the web container) not to buffer either.
    'X-Accel-Buffering': 'no',
    // Already "encoded": keeps LiteSpeed's dynamic gzip (on for text/*) from
    // holding words back to compress them in batches.
    'Content-Encoding': 'identity',
  });
  res.flushHeaders();

  const controller = new AbortController();
  // The person pressed Stop (or closed the tab).
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  const emit = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  // Keeps proxies from closing a quiet connection while a long video is studied.
  const heartbeat = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), 15_000);

  try {
    await streamAnswer(context(req), req.body, { emit, signal: controller.signal });
  } catch (error) {
    const known = error instanceof AppError;
    if (!known) logger.error({ err: error }, 'AI answer failed');
    emit('error', {
      status: known ? error.statusCode : 500,
      code: known ? error.code : 'INTERNAL',
      message: known
        ? error.message
        : 'The AI assistant could not answer just now. Please try again.',
      details: known ? (error.details ?? null) : null,
    });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

const imageSchema = z.object({
  prompt: z.string().trim().min(3, 'Describe the image you want').max(4000),
  threadId: objectId.optional(),
  agentId: objectId.optional(),
  referenceFileIds: z
    .array(objectId)
    .max(MAX_REF_IMAGES, `Add up to ${MAX_REF_IMAGES} reference images`)
    .optional(),
  aspectRatio: z.enum(IMAGE_ASPECT_RATIOS).optional(),
  style: z.enum(Object.keys(IMAGE_STYLES)).optional(),
  modelKey: z.string().trim().max(40).optional(),
});

// "Create image": a picture from a prompt and reference images, saved to Drive.
// Editors and up, since the picture becomes a Drive file.
router.post(
  '/images',
  aiChatLimiter,
  canEdit,
  validate({ body: imageSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await createImage(context(req), req.body), { status: 201 });
  }),
);

// How the account's AI usage was spent. Owners and admins only, like billing.
router.get(
  '/credits/history',
  canAdminister,
  validate({ query: historyQuery }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listLedger(req.storagePool._id, req.query));
  }),
);

export default router;
