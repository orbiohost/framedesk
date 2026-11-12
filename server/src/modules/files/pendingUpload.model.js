import mongoose, { Schema } from 'mongoose';

// An upload going straight from the browser into S3 (a multipart upload).
// It becomes a File once every part is in and the server has checked it.
// Unfinished ones are aborted in S3 and removed by sweepExpiredUploads().
const pendingUploadSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    storageKey: { type: String, required: true, unique: true },
    s3UploadId: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    partSize: { type: Number, required: true, min: 1 },
    partCount: { type: Number, required: true, min: 1 },
    // What prepareUpload() verified (names, folder, tags, transcribe options).
    metadata: { type: Schema.Types.Mixed, required: true },
    // Pushed forward whenever the browser asks for more part links.
    expiresAt: { type: Date, required: true, index: true },
    // Set while one request completes it, so a double "complete" can't create two files.
    completingAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const PendingUpload = mongoose.model('PendingUpload', pendingUploadSchema);
