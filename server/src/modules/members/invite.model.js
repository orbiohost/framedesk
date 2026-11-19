import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';
import { INVITE_ROLES } from './roles.js';

export const INVITE_STATUSES = ['pending', 'accepted', 'revoked'];

// An emailed (or copied) link that adds someone to a workspace once they sign
// in with the invited address. Only the token's hash is stored.
const inviteSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: INVITE_ROLES, required: true },
    tokenHash: { type: String, required: true },
    status: { type: String, enum: INVITE_STATUSES, default: 'pending' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    acceptedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

inviteSchema.plugin(workspaceScopePlugin);
inviteSchema.index({ tokenHash: 1 }, { unique: true });
inviteSchema.index({ workspaceId: 1, status: 1, email: 1 });

export const Invite = mongoose.model('Invite', inviteSchema);
