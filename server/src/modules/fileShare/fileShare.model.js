import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';
import { SHARE_AUDIENCES } from '../projects/project.model.js';

export const MAX_SHARED_FILES = 100;

// A link to one file or a hand-picked set of files. Unlike a project link it
// has no on/off switch: deleting the record is how sharing stops.
const fileShareSchema = new Schema(
  {
    token: { type: String, required: true, unique: true },
    fileIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'File' }],
      validate: {
        validator: (ids) => ids.length >= 1 && ids.length <= MAX_SHARED_FILES,
        message: `Share between 1 and ${MAX_SHARED_FILES} files`,
      },
    },
    audience: { type: String, enum: SHARE_AUDIENCES, default: 'anyone' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

fileShareSchema.plugin(workspaceScopePlugin);
fileShareSchema.index({ workspaceId: 1, fileIds: 1 });
fileShareSchema.index({ workspaceId: 1, createdBy: 1, createdAt: -1 });

export const FileShare = mongoose.model('FileShare', fileShareSchema);

// Files deleted for good drop out of every link; a link left with no files goes too.
export async function removeFilesFromShares(workspaceId, fileIds) {
  if (fileIds.length === 0) return;
  await FileShare.updateMany(
    { workspaceId, fileIds: { $in: fileIds } },
    { $pull: { fileIds: { $in: fileIds } } },
  );
  await FileShare.deleteMany({ workspaceId, fileIds: { $size: 0 } });
}
