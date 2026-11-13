import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { viewerOf } from '../files/folderAccess.js';
import * as fileShareService from './fileShare.service.js';

// --- Managing links (inside a workspace) ---

export const list = asyncHandler(async (req, res) => {
  const shares = await fileShareService.listFileShares(req.workspace._id, viewerOf(req));
  sendSuccess(res, { shares });
});

export const find = asyncHandler(async (req, res) => {
  const share = await fileShareService.findFileShare(
    req.workspace._id,
    req.query.ids,
    viewerOf(req),
  );
  sendSuccess(res, { share });
});

export const create = asyncHandler(async (req, res) => {
  const share = await fileShareService.createFileShare(
    req.workspace._id,
    req.user._id,
    req.body,
    viewerOf(req),
  );
  sendSuccess(res, { share }, { status: 201 });
});

export const update = asyncHandler(async (req, res) => {
  const share = await fileShareService.updateFileShare(
    req.workspace._id,
    req.params.shareId,
    req.body,
    viewerOf(req),
  );
  sendSuccess(res, { share });
});

export const remove = asyncHandler(async (req, res) => {
  await fileShareService.deleteFileShare(req.workspace._id, req.params.shareId, viewerOf(req));
  sendSuccess(res, { deleted: true });
});

// --- Using a link (public; req.user may be null) ---

// Runs first on every public route and leaves the resolved link on the request.
export const loadShare = asyncHandler(async (req, res, next) => {
  req.fileShare = await fileShareService.resolveFileShare(req.params.token, req.user);
  // Never cached by a proxy or kept after the link is deleted.
  res.set('Cache-Control', 'no-store');
  next();
});

export const getFiles = asyncHandler(async (req, res) => {
  sendSuccess(res, await fileShareService.getSharedFiles(req.fileShare, req.user));
});

export const fileUrl = asyncHandler(async (req, res) => {
  sendSuccess(
    res,
    await fileShareService.createSharedFileUrl(req.fileShare, req.params.fileId, req.query),
  );
});

export const previewUrls = asyncHandler(async (req, res) => {
  sendSuccess(res, await fileShareService.createSharedPreviewUrls(req.fileShare, req.body.fileIds));
});
