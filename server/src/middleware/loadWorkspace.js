import mongoose from 'mongoose';
import { findWorkspaceForMember } from '../modules/workspaces/workspaces.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Mount on any route containing :workspaceId (after authenticate).
// Sets req.workspace, req.membership and req.storagePool; everything downstream scopes by req.workspace._id.
export const loadWorkspace = asyncHandler(async (req, res, next) => {
  const { workspaceId } = req.params;
  if (!mongoose.isValidObjectId(workspaceId)) throw AppError.notFound('Workspace not found');

  const { workspace, membership, pool } = await findWorkspaceForMember({
    workspaceId,
    userId: req.user._id,
  });
  req.workspace = workspace;
  req.membership = membership;
  // The account workspace holding the plan and storage (req.workspace itself unless shared).
  req.storagePool = pool;
  next();
});
