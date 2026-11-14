import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

const momentSchema = new Schema(
  {
    // "mm:ss" or "h:mm:ss" into the clip; a page number for documents.
    at: { type: String, trim: true, maxlength: 20 },
    text: { type: String, trim: true, maxlength: 400 },
  },
  { _id: false },
);

// What Gemini made of one file, so the assistant can answer from it without
// looking at the bytes again. One per file.
const aiInsightSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'File', required: true },
    summary: { type: String, default: '', maxlength: 2000 },
    details: { type: String, default: '', maxlength: 12_000 },
    tags: { type: [String], default: [] },
    moments: { type: [momentSchema], default: [] },
    language: { type: String, default: null },
    // 'media' = Gemini saw the file itself; 'transcript' = only its transcript; 'text' = its text.
    source: { type: String, enum: ['media', 'transcript', 'text'], default: 'media' },
    model: { type: String, default: null },
    tokens: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    // Why a file was skipped or failed, for the file list.
    note: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true },
);

aiInsightSchema.plugin(workspaceScopePlugin);
aiInsightSchema.index({ workspaceId: 1, fileId: 1 }, { unique: true });

export const AiInsight = mongoose.model('AiInsight', aiInsightSchema);

export async function deleteInsightsForFiles(workspaceId, fileIds) {
  if (fileIds.length === 0) return;
  await AiInsight.deleteMany({ workspaceId, fileId: { $in: fileIds } });
}
