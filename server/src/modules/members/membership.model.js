import mongoose, { Schema } from 'mongoose';
import { cacheInvalidationPlugin, idsIn } from '../../utils/cacheInvalidation.plugin.js';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';
import { MEMBERSHIP_STATUSES, WORKSPACE_ROLES } from './roles.js';

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: WORKSPACE_ROLES, required: true },
    // Per-member permission keys layered on the role preset (defined in Phase 3).
    permissions: { type: [String], default: [] },
    status: { type: String, enum: MEMBERSHIP_STATUSES, default: 'active' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    joinedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

membershipSchema.plugin(workspaceScopePlugin);
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ workspaceId: 1, status: 1 });
membershipSchema.index({ userId: 1, status: 1 });

// Memberships are cached per workspace (workspaces.service.js); writes clear them.
membershipSchema.plugin(cacheInvalidationPlugin, {
  scopesFor: (source) => idsIn(source.workspaceId)?.map((id) => `members:${id}`) ?? null,
});

export const Membership = mongoose.model('Membership', membershipSchema);
