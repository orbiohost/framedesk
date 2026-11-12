export const WORKSPACE_ROLES = ['owner', 'admin', 'manager', 'editor', 'viewer', 'client'];

export const MEMBERSHIP_STATUSES = ['pending', 'active', 'inactive', 'revoked'];

// Coarse role groups used until the permission-key system (Phase 3) replaces them.
// Clients are left out on purpose: they will only get review links.
export const VIEW_ROLES = ['owner', 'admin', 'manager', 'editor', 'viewer'];
export const EDIT_ROLES = ['owner', 'admin', 'manager', 'editor'];
export const MANAGE_ROLES = ['owner', 'admin', 'manager'];
export const ADMIN_ROLES = ['owner', 'admin'];
