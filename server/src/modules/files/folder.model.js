import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

// "team": everyone who can see the workspace's files. "restricted": only the
// people in allowedUserIds (owners and admins always get in).
export const FOLDER_ACCESS_MODES = ['team', 'restricted'];

const folderSchema = new Schema(
  {
    // Null for the workspace Drive, which holds files that belong to no project.
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    // Null for top-level folders.
    parentId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    isDefault: { type: Boolean, default: false },
    position: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Applies to everything inside too: subfolders and their files.
    access: { type: String, enum: FOLDER_ACCESS_MODES, default: 'team' },
    allowedUserIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true },
);

folderSchema.plugin(workspaceScopePlugin);
// One name per level, so "Exports" can't exist twice side by side.
folderSchema.index({ workspaceId: 1, projectId: 1, parentId: 1, name: 1 }, { unique: true });

export const Folder = mongoose.model('Folder', folderSchema);
