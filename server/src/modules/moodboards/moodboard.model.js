import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const ITEM_TYPES = ['image', 'video', 'note', 'color', 'link', 'text', 'shape'];
export const SHAPE_KINDS = ['rect', 'ellipse', 'diamond'];
export const STROKE_STYLES = ['solid', 'dashed', 'dotted'];
export const MAX_ITEMS = 400;
export const MAX_STROKES = 600;
export const MAX_CONNECTORS = 500;
export const ARROW_HEADS = ['end', 'both', 'none'];
// Across all strokes: enough for a lot of sketching, small enough for one document.
export const MAX_STROKE_POINTS = 80_000;
export const MAX_CHAT = 40;

// One thing on the board, in board coordinates (pixels at 100% zoom).
// image/video: a file in the workspace Drive (folder "Moodboards").
// note: a sticky note; text: a free heading; color: a swatch; link: a web page;
// shape: a rectangle, ellipse or diamond with text inside (as in Excalidraw).
const itemSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 40 },
    type: { type: String, enum: ITEM_TYPES, required: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    w: { type: Number, default: 200, min: 8, max: 10_000 },
    h: { type: Number, default: 200, min: 8, max: 10_000 },
    z: { type: Number, default: 0 },
    fileId: { type: Schema.Types.ObjectId, ref: 'File', default: null },
    text: { type: String, maxlength: 4000, default: '' },
    color: { type: String, maxlength: 20, default: null },
    url: { type: String, maxlength: 2000, default: null },
    title: { type: String, maxlength: 300, default: null },
    // Headings: their type size (the box is fitted around the words).
    fontSize: { type: Number, min: 6, max: 600, default: null },
    // Shapes: their kind and look (color is the outline and the text).
    shape: { type: String, enum: [...SHAPE_KINDS, null], default: null },
    fill: { type: String, maxlength: 20, default: null },
    strokeWidth: { type: Number, min: 1, max: 24, default: null },
    strokeStyle: { type: String, enum: [...STROKE_STYLES, null], default: null },
    rounded: { type: Boolean, default: null },
  },
  { _id: false },
);

// One end of an arrow: stuck to an item (it follows when the item moves), or
// a free point on the board.
const endSchema = new Schema(
  {
    itemId: { type: String, maxlength: 40, default: null },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
  },
  { _id: false },
);

// An arrow (or plain line) between two things on the board, as in Excalidraw.
const connectorSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 40 },
    from: { type: endSchema, required: true },
    to: { type: endSchema, required: true },
    color: { type: String, maxlength: 20, default: '#16151b' },
    width: { type: Number, min: 1, max: 24, default: 2 },
    dashed: { type: Boolean, default: false },
    head: { type: String, enum: ARROW_HEADS, default: 'end' },
    label: { type: String, maxlength: 300, default: '' },
  },
  { _id: false },
);

// A pen stroke on the sketch layer: [x1, y1, x2, y2, ...] rounded to whole pixels.
const strokeSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 40 },
    color: { type: String, maxlength: 20, default: '#16151b' },
    width: { type: Number, min: 1, max: 80, default: 4 },
    points: { type: [Number], default: [] },
  },
  { _id: false },
);

const pointSchema = new Schema(
  { title: { type: String, maxlength: 200 }, text: { type: String, maxlength: 1500 } },
  { _id: false },
);

// What the AI made of the board: a creative brief and its parts.
const analysisSchema = new Schema(
  {
    title: { type: String, maxlength: 200, default: '' },
    summary: { type: String, maxlength: 4000, default: '' },
    palette: {
      type: [
        new Schema(
          {
            hex: { type: String, maxlength: 9 },
            name: { type: String, maxlength: 60 },
            role: { type: String, maxlength: 120 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    keywords: { type: [String], default: [] },
    typography: { type: [pointSchema], default: [] },
    directions: { type: [pointSchema], default: [] },
    references: { type: [String], default: [] },
    brief: { type: String, maxlength: 30_000, default: '' },
    generatedAt: { type: Date, default: null },
    model: { type: String, default: null },
    credits: { type: Number, default: 0 },
  },
  { _id: false },
);

const chatSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, maxlength: 12_000, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

// A moodboard: images, video, notes, colours, links and sketches on one canvas,
// linked to projects, with an AI-written creative brief.
const moodboardSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    projectIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Project' }], default: [] },
    items: { type: [itemSchema], default: [] },
    strokes: { type: [strokeSchema], default: [] },
    connectors: { type: [connectorSchema], default: [] },
    // Where the board was last looked at, so it opens there again.
    viewport: {
      type: new Schema({ x: Number, y: Number, zoom: Number }, { _id: false }),
      default: () => ({ x: 0, y: 0, zoom: 1 }),
    },
    // Bumped on every canvas save; a save from an older copy is refused.
    version: { type: Number, default: 0 },
    analysis: { type: analysisSchema, default: null },
    chat: { type: [chatSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

moodboardSchema.plugin(workspaceScopePlugin);
moodboardSchema.index({ workspaceId: 1, updatedAt: -1 });
moodboardSchema.index({ workspaceId: 1, projectIds: 1 });

export const Moodboard = mongoose.model('Moodboard', moodboardSchema);
