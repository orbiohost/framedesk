import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as shareService from './projectShare.service.js';

// --- Managing a project's link (inside a workspace) ---

export const getSettings = asyncHandler(async (req, res) => {
  const share = await shareService.getShareSettings(req.workspace._id, req.params.projectId);
  sendSuccess(res, { share });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const share = await shareService.updateShareSettings(
    req.workspace._id,
    req.params.projectId,
    req.user._id,
    req.body,
  );
  sendSuccess(res, { share });
});

export const resetLink = asyncHandler(async (req, res) => {
  const share = await shareService.resetShareLink(
    req.workspace._id,
    req.params.projectId,
    req.user._id,
  );
  sendSuccess(res, { share });
});

// --- Using a link (public; req.user may be null) ---

// Runs first on every public route and leaves the resolved share on the request.
export const loadShare = asyncHandler(async (req, res, next) => {
  req.share = await shareService.resolveShare(req.params.token, req.user);
  // Shared pages must never be cached by a proxy or kept after the link is turned off.
  res.set('Cache-Control', 'no-store');
  next();
});

export const getProject = asyncHandler(async (req, res) => {
  sendSuccess(res, await shareService.getSharedProject(req.share, req.user));
});

export const listTasks = asyncHandler(async (req, res) => {
  sendSuccess(res, { tasks: await shareService.listSharedTasks(req.share) });
});

export const createTask = asyncHandler(async (req, res) => {
  const task = await shareService.createSharedTask(req.share, req.user, req.body);
  sendSuccess(res, { task }, { status: 201 });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await shareService.updateSharedTask(req.share, req.params.taskId, req.body);
  sendSuccess(res, { task });
});

export const listFiles = asyncHandler(async (req, res) => {
  sendSuccess(res, await shareService.listSharedFiles(req.share, req.query));
});

export const fileUrl = asyncHandler(async (req, res) => {
  sendSuccess(res, await shareService.createSharedFileUrl(req.share, req.params.fileId, req.query));
});

export const previewUrls = asyncHandler(async (req, res) => {
  sendSuccess(res, await shareService.createSharedPreviewUrls(req.share, req.body.fileIds));
});

export const calendar = asyncHandler(async (req, res) => {
  sendSuccess(res, { items: await shareService.getSharedCalendar(req.share, req.query) });
});

export const listNotes = asyncHandler(async (req, res) => {
  sendSuccess(res, { notes: await shareService.listSharedNotes(req.share) });
});
