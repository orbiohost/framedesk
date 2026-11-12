import mongoose, { Schema } from 'mongoose';
import { PRIORITIES } from '../../config/constants.js';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const TASK_STATUSES = ['todo', 'doing', 'review', 'done'];

// Gap between neighbouring tasks, so a drag-and-drop move can usually take the
// midpoint of its new neighbours without renumbering the whole column.
export const ORDER_STEP = 1024;

const checklistItemSchema = new Schema({
  text: { type: String, required: true, trim: true, maxlength: 300 },
  done: { type: Boolean, default: false },
});

const taskSchema = new Schema(
  {
    // Null for personal to-dos that don't belong to a project.
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, maxlength: 10000, default: null },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    checklist: { type: [checklistItemSchema], default: [] },
    order: { type: Number, required: true },
    completedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

taskSchema.plugin(workspaceScopePlugin);
taskSchema.index({ workspaceId: 1, projectId: 1, status: 1, order: 1 });
taskSchema.index({ workspaceId: 1, assigneeId: 1, status: 1 });
taskSchema.index({ workspaceId: 1, dueDate: 1 });

export const Task = mongoose.model('Task', taskSchema);
