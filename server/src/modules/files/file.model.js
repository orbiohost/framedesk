import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';
import { FILE_CATEGORIES } from './fileTypes.js';

export const FILE_STATUSES = ['raw', 'in_progress', 'approved', 'final'];

const fileSchema = new Schema(
  {
    // Null for files in the workspace Drive.
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder', required: true },
    // What people see. The bytes live under storageKey (a random uuid), never under this name.
    displayName: { type: String, required: true, trim: true, maxlength: 200 },
    extension: { type: String, required: true },
    category: { type: String, enum: FILE_CATEGORIES, required: true },
    storageKey: { type: String, required: true, unique: true },
    size: { type: Number, required: true, min: 0 },
    mime: { type: String, required: true },
    version: { type: Number, default: 1 },
    status: { type: String, enum: FILE_STATUSES, default: 'raw' },
    tags: { type: [String], default: [] },
    // Other projects this file is linked to (a Drive file can be linked to any
    // project). It shows up under those projects' files, but stays where it is.
    linkedProjectIds: { type: [Schema.Types.ObjectId], ref: 'Project', default: [] },
    // Free text for the team: what this cut is, what to fix, where it came from.
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

fileSchema.plugin(workspaceScopePlugin);
fileSchema.index({ workspaceId: 1, folderId: 1, deletedAt: 1, _id: -1 });
fileSchema.index({ workspaceId: 1, projectId: 1, deletedAt: 1 });
fileSchema.index({ workspaceId: 1, linkedProjectIds: 1, deletedAt: 1 });

// Named StoredFile in code so it never shadows the global File class.
export const StoredFile = mongoose.model('File', fileSchema);
