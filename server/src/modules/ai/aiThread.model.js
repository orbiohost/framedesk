import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const MAX_THREAD_MESSAGES = 200;

const messageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'model'], required: true },
    text: { type: String, required: true, maxlength: 20_000 },
    // 'image': a "Create image" request and its picture.
    kind: { type: String, enum: ['text', 'image'], default: 'text' },
    // Pictures the AI made for this answer (Drive files in "AI images").
    images: { type: [Schema.Types.ObjectId], default: [] },
    imageOptions: {
      type: new Schema(
        {
          aspectRatio: { type: String, maxlength: 8 },
          style: { type: String, maxlength: 20 },
        },
        { _id: false },
      ),
      default: undefined,
    },
    // Files the answer pointed to, so the chat can open them.
    fileIds: { type: [Schema.Types.ObjectId], default: [] },
    credits: { type: Number, default: 0 },
    // The project a question was limited to with "/".
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    projectTitle: { type: String, default: null, maxlength: 160 },
    // Asked with "//": the whole Drive was read.
    wholeDrive: { type: Boolean, default: false },
    // Text the question was about (picked in an answer, or an earlier answer).
    quote: { type: String, default: null, maxlength: 12000 },
    // Files attached to a question with "@" or uploaded in the chat.
    attachments: {
      type: [
        new Schema(
          {
            fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile', required: true },
            name: { type: String, required: true, maxlength: 200 },
            category: { type: String, default: null, maxlength: 40 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    // Notes added to a question with "#" (title kept for the chip if the note goes).
    notes: {
      type: [
        new Schema(
          {
            noteId: { type: Schema.Types.ObjectId, ref: 'QuickNote', required: true },
            title: { type: String, required: true, maxlength: 160 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    // Skills picked with "!" for this question.
    skills: {
      type: [
        new Schema(
          {
            id: { type: String, required: true, maxlength: 40 },
            name: { type: String, required: true, maxlength: 60 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    // True when the person stopped the answer before it finished.
    stopped: { type: Boolean, default: false },
    // The model (FrameDesk name) that wrote an answer.
    modelName: { type: String, maxlength: 40, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

// One chat in a person's AI history. Private to that person.
const aiThreadSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    // The custom assistant this chat is with (null: the default assistant).
    agentId: { type: Schema.Types.ObjectId, ref: 'AiAgent', default: null },
    agentName: { type: String, default: null, maxlength: 60 },
    messages: { type: [messageSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

aiThreadSchema.plugin(workspaceScopePlugin);
aiThreadSchema.index({ workspaceId: 1, userId: 1, lastMessageAt: -1 });

export const AiThread = mongoose.model('AiThread', aiThreadSchema);
