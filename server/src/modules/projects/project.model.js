import mongoose, { Schema } from 'mongoose';
import { PRIORITIES } from '../../config/constants.js';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const PROJECT_TYPES = ['video_edit', 'branding', 'motion', 'social', 'other'];
export const PROJECT_STATUSES = ['draft', 'active', 'pending', 'review', 'completed', 'archived'];
// anyone: whoever has the link, signed in or not. signed_in: any FrameDesk account.
export const SHARE_AUDIENCES = ['anyone', 'signed_in'];
// view: read only. edit: may also add and change the project's tasks.
export const SHARE_PERMISSIONS = ['view', 'edit'];

// The project's share link. The token stays when sharing is switched off, so
// switching it back on revives the same link; "reset link" replaces it.
const shareSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    token: { type: String, default: null },
    audience: { type: String, enum: SHARE_AUDIENCES, default: 'anyone' },
    permission: { type: String, enum: SHARE_PERMISSIONS, default: 'view' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const projectSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    type: { type: String, enum: PROJECT_TYPES, default: 'other' },
    status: { type: String, enum: PROJECT_STATUSES, default: 'active' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    // Whole rupees.
    budget: { type: Number, min: 0, default: null },
    description: { type: String, maxlength: 10000, default: null },
    tags: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    share: { type: shareSchema, default: () => ({}) },
  },
  { timestamps: true },
);

projectSchema.plugin(workspaceScopePlugin);
// Share links are looked up by token alone, across workspaces.
projectSchema.index(
  { 'share.token': 1 },
  { unique: true, partialFilterExpression: { 'share.token': { $type: 'string' } } },
);
projectSchema.index({ workspaceId: 1, status: 1, updatedAt: -1 });
projectSchema.index({ workspaceId: 1, clientId: 1 });
projectSchema.index({ workspaceId: 1, dueDate: 1 });

export const Project = mongoose.model('Project', projectSchema);
