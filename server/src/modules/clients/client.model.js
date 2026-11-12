import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

const clientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, trim: true, maxlength: 120, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, trim: true, maxlength: 40, default: null },
    notes: { type: String, maxlength: 5000, default: null },
    tags: { type: [String], default: [] },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

clientSchema.plugin(workspaceScopePlugin);
clientSchema.index({ workspaceId: 1, archivedAt: 1, name: 1 });
clientSchema.index({ workspaceId: 1, tags: 1 });

export const Client = mongoose.model('Client', clientSchema);
