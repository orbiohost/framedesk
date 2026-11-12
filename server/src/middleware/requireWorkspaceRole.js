import { ADMIN_ROLES, EDIT_ROLES, MANAGE_ROLES, VIEW_ROLES } from '../modules/members/roles.js';
import { AppError } from '../utils/AppError.js';

// Coarse role gates. Phase 3 replaces these with requirePermission("key"),
// so routes should use the named gates below rather than listing roles.
export function requireWorkspaceRole(...allowedRoles) {
  return function checkWorkspaceRole(req, res, next) {
    if (!allowedRoles.includes(req.membership?.role)) {
      return next(AppError.forbidden("Your role in this workspace doesn't allow this"));
    }
    next();
  };
}

export const canView = requireWorkspaceRole(...VIEW_ROLES);
export const canEdit = requireWorkspaceRole(...EDIT_ROLES);
export const canManage = requireWorkspaceRole(...MANAGE_ROLES);
export const canAdminister = requireWorkspaceRole(...ADMIN_ROLES);
