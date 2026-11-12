import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { deleteWorkspace } from './workspaceDeletion.service.js';
import * as workspacesService from './workspaces.service.js';

export const listMine = asyncHandler(async (req, res) => {
  const workspaces = await workspacesService.listWorkspacesForUser(req.user._id);
  sendSuccess(res, { workspaces });
});

export const create = asyncHandler(async (req, res) => {
  const workspace = await workspacesService.createWorkspace({
    ownerId: req.user._id,
    name: req.body.name,
  });
  sendSuccess(res, { workspace }, { status: 201 });
});

export function getOne(req, res) {
  const workspace = workspacesService.toWorkspaceSummary(
    req.workspace,
    req.membership,
    req.storagePool,
  );
  sendSuccess(res, { workspace });
}

export const rename = asyncHandler(async (req, res) => {
  const updated = await workspacesService.renameWorkspace(req.workspace._id, req.body);
  const isOwnAccount = String(req.storagePool._id) === String(updated._id);
  const pool = isOwnAccount ? updated : req.storagePool;
  sendSuccess(res, {
    workspace: workspacesService.toWorkspaceSummary(updated, req.membership, pool),
  });
});

export const remove = asyncHandler(async (req, res) => {
  await deleteWorkspace({
    workspace: req.workspace,
    membership: req.membership,
    userId: req.user._id,
    confirmName: req.body.confirmName,
  });
  sendSuccess(res, { deleted: true });
});
