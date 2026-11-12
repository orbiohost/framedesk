import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { viewerOf } from './folderAccess.js';
import * as foldersService from './folders.service.js';

export const list = asyncHandler(async (req, res) => {
  const folders = await foldersService.listFolders(
    req.workspace._id,
    req.query.projectId,
    viewerOf(req),
  );
  sendSuccess(res, { folders });
});

export const create = asyncHandler(async (req, res) => {
  const folder = await foldersService.createFolder(
    req.workspace._id,
    req.user._id,
    req.body,
    viewerOf(req),
  );
  sendSuccess(res, { folder }, { status: 201 });
});

export const update = asyncHandler(async (req, res) => {
  const folder = await foldersService.updateFolder(
    req.workspace._id,
    req.params.folderId,
    req.body,
    viewerOf(req),
  );
  sendSuccess(res, { folder });
});

export const setAccess = asyncHandler(async (req, res) => {
  const folder = await foldersService.setFolderAccess(
    req.workspace._id,
    req.params.folderId,
    req.body,
    viewerOf(req),
  );
  sendSuccess(res, { folder });
});

export const remove = asyncHandler(async (req, res) => {
  await foldersService.deleteFolder(req.workspace._id, req.params.folderId, viewerOf(req));
  sendSuccess(res, { deleted: true });
});
