// Mirrors the server's coarse role gates until the permission system (Phase 3).
const VIEW_ROLES = ['owner', 'admin', 'manager', 'editor', 'viewer'];
const EDIT_ROLES = ['owner', 'admin', 'manager', 'editor'];
const MANAGE_ROLES = ['owner', 'admin', 'manager'];
const ADMIN_ROLES = ['owner', 'admin'];

export function canView(workspace) {
  return VIEW_ROLES.includes(workspace.role);
}

export function canEdit(workspace) {
  return EDIT_ROLES.includes(workspace.role);
}

export function canManage(workspace) {
  return MANAGE_ROLES.includes(workspace.role);
}

export function canAdminister(workspace) {
  return ADMIN_ROLES.includes(workspace.role);
}
