import { Router } from 'express';
import { z } from 'zod';
import { aiChatLimiter } from '../../middleware/rateLimit.js';
import { canEdit, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { objectId } from '../../utils/zodHelpers.js';
import { viewerOf } from '../files/folderAccess.js';
import {
  ARROW_HEADS,
  ITEM_TYPES,
  MAX_CONNECTORS,
  MAX_ITEMS,
  MAX_STROKES,
} from './moodboard.model.js';
import {
  addNoteToBoard,
  analyseMoodboard,
  askMoodboard,
  createMoodboard,
  deleteMoodboard,
  getMoodboard,
  getUploadFolder,
  listMoodboards,
  saveBriefAsNote,
  saveCanvas,
  updateMoodboard,
} from './moodboards.service.js';

// Mounted at /workspaces/:workspaceId/moodboards.
const router = Router();

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);
const itemSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(ITEM_TYPES),
  x: coordinate,
  y: coordinate,
  w: z.number().min(8).max(10_000),
  h: z.number().min(8).max(10_000),
  z: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  fileId: objectId.nullable().optional(),
  text: z.string().max(4000).optional(),
  color: hexColor.nullable().optional(),
  url: z
    .string()
    .url()
    .max(2000)
    .refine((url) => /^https?:\/\//i.test(url), 'Links must start with http(s)://')
    .nullable()
    .optional(),
  title: z.string().max(300).nullable().optional(),
  fontSize: z.number().min(6).max(600).nullable().optional(),
});
const endSchema = z.object({
  itemId: z.string().max(40).nullable().optional(),
  x: coordinate,
  y: coordinate,
});
const connectorSchema = z.object({
  id: z.string().min(1).max(40),
  from: endSchema,
  to: endSchema,
  color: hexColor,
  width: z.number().min(1).max(24),
  dashed: z.boolean().optional(),
  head: z.enum(ARROW_HEADS).optional(),
  label: z.string().max(300).optional(),
});
const strokeSchema = z.object({
  id: z.string().min(1).max(40),
  color: hexColor,
  width: z.number().min(1).max(80),
  points: z.array(coordinate).max(20_000),
});
const canvasSchema = z.object({
  items: z.array(itemSchema).max(MAX_ITEMS),
  strokes: z.array(strokeSchema).max(MAX_STROKES),
  connectors: z.array(connectorSchema).max(MAX_CONNECTORS).default([]),
  viewport: z
    .object({ x: coordinate, y: coordinate, zoom: z.number().min(0.05).max(8) })
    .optional(),
  version: z.number().int().min(0),
});
const boardSchema = z.object({
  title: z.string().trim().min(1, 'Give the board a name').max(160),
  description: z.string().trim().max(2000).optional(),
  projectIds: z.array(objectId).max(10).optional(),
});
const params = z.object({ boardId: objectId });
const listQuery = z.object({ projectId: objectId.optional() });
// The sketch layer as a PNG drawn in the browser (images can't be, they are
// read from storage on the server).
const sketchPng = z.string().max(4_500_000).optional();

function ctx(req) {
  return { workspace: req.workspace, pool: req.storagePool, user: req.user, viewer: viewerOf(req) };
}

router.get(
  '/',
  canView,
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, {
      moodboards: await listMoodboards(req.workspace._id, req.query, viewerOf(req)),
    });
  }),
);

router.post(
  '/',
  canEdit,
  validate({ body: boardSchema }),
  asyncHandler(async (req, res) => {
    const moodboard = await createMoodboard(
      req.workspace._id,
      req.user._id,
      req.body,
      viewerOf(req),
    );
    sendSuccess(res, { moodboard }, { status: 201 });
  }),
);

// Where pasted and dropped images and videos are stored (Drive → Moodboards).
router.post(
  '/upload-folder',
  canEdit,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { folder: await getUploadFolder(req.workspace._id, req.user._id) });
  }),
);

router.get(
  '/:boardId',
  canView,
  validate({ params }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, {
      moodboard: await getMoodboard(req.workspace._id, req.params.boardId, viewerOf(req)),
    });
  }),
);

router.patch(
  '/:boardId',
  canEdit,
  validate({ params, body: boardSchema.partial() }),
  asyncHandler(async (req, res) => {
    const moodboard = await updateMoodboard(
      req.workspace._id,
      req.params.boardId,
      req.user._id,
      req.body,
      viewerOf(req),
    );
    sendSuccess(res, { moodboard });
  }),
);

router.put(
  '/:boardId/canvas',
  canEdit,
  validate({ params, body: canvasSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await saveCanvas(req.workspace._id, req.params.boardId, req.user._id, req.body),
    );
  }),
);

router.delete(
  '/:boardId',
  canEdit,
  validate({ params }),
  asyncHandler(async (req, res) => {
    await deleteMoodboard(req.workspace._id, req.params.boardId);
    sendSuccess(res, { deleted: true });
  }),
);

router.post(
  '/:boardId/analyse',
  aiChatLimiter,
  canView,
  validate({
    params,
    body: z.object({ sketchPng, focus: z.string().trim().max(1000).optional() }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { moodboard: await analyseMoodboard(ctx(req), req.params.boardId, req.body) });
  }),
);

router.post(
  '/:boardId/ask',
  aiChatLimiter,
  canView,
  validate({
    params,
    body: z.object({ question: z.string().trim().min(1, 'Type a question').max(2000), sketchPng }),
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { moodboard: await askMoodboard(ctx(req), req.params.boardId, req.body) });
  }),
);

// A sticky note with given text (e.g. text picked in an AI answer).
router.post(
  '/:boardId/notes',
  canEdit,
  validate({
    params,
    body: z.object({
      text: z.string().trim().min(1, 'Nothing to add').max(4000),
      color: hexColor.optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await addNoteToBoard(
      req.workspace._id,
      req.params.boardId,
      req.user._id,
      req.body,
    );
    sendSuccess(res, result, { status: 201 });
  }),
);

router.post(
  '/:boardId/note',
  canView,
  validate({ params }),
  asyncHandler(async (req, res) => {
    const note = await saveBriefAsNote(req.workspace._id, req.user._id, req.params.boardId);
    sendSuccess(res, { note }, { status: 201 });
  }),
);

export default router;
