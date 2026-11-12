import mongoose, { Schema } from 'mongoose';

// A profile picture, already resized in the browser to a small square (a few KB).
// It lives in its own collection so user lookups never load the bytes, and is
// served from an unguessable key so the URL can be cached forever.
const avatarSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true },
);

export const Avatar = mongoose.model('Avatar', avatarSchema);
