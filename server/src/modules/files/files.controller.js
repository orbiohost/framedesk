import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as filesService from './files.service.js';
import { viewerOf } from './folderAccess.js';
import { getStorageUsage } from './storageUsage.service.js';

export const list = asyncHandler(async (req, res) => {
  const { files, nextCursor } = await filesService.listFiles(
    req.workspace._id,
    req.query,
    viewerOf(req),
  );
  sendSuccess(res, { files, nextCursor });
});

export const update = asyncHandler(async (req, res) => {
  const file = await filesService.updateFile(
    req.workspace._id,
    req.params.fileId,
    req.body,
    viewerOf(req),
  );
  sendSuccess(res, { file });
});

export const trash = asyncHandler(async (req, res) => {
  const file = await filesService.trashFile(
    req.workspace._id,
    req.params.fileId,
    req.user._id,
    viewerOf(req),
  );
  sendSuccess(res, { file });
});

export const restore = asyncHandler(async (req, res) => {
  const file = await filesService.restoreFile(req.workspace._id, req.params.fileId, viewerOf(req));
  sendSuccess(res, { file });
});

export const removeForever = asyncHandler(async (req, res) => {
  await filesService.deleteFilePermanently(req.workspace._id, req.params.fileId, viewerOf(req));
  sendSuccess(res, { deleted: true });
});

export const emptyTrash = asyncHandler(async (req, res) => {
  const result = await filesService.emptyTrash(
    req.workspace._id,
    req.query.projectId ?? null,
    viewerOf(req),
  );
  sendSuccess(res, result);
});

export const previewUrls = asyncHandler(async (req, res) => {
  const links = await filesService.createPreviewUrls(
    req.workspace._id,
    req.query.ids,
    viewerOf(req),
  );
  sendSuccess(res, links);
});

export const url = asyncHandler(async (req, res) => {
  const link = await filesService.createFileUrl(
    req.workspace._id,
    req.params.fileId,
    req.query,
    viewerOf(req),
  );
  sendSuccess(res, link);
});

export const storageUsage = asyncHandler(async (req, res) => {
  sendSuccess(res, { usage: await getStorageUsage(req.workspace) });
});
