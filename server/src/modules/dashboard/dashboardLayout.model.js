import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

// Column spans a widget can take on the 12-column dashboard grid.
export const WIDGET_SPANS = [3, 4, 5, 6, 8, 12];
export const MAX_WIDGETS = 30;

const widgetSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 40 },
    span: { type: Number, enum: WIDGET_SPANS, required: true },
  },
  { _id: false },
);

// Each person's own arrangement of dashboard widgets, per workspace.
const dashboardLayoutSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    widgets: { type: [widgetSchema], default: [] },
  },
  { timestamps: true },
);

dashboardLayoutSchema.plugin(workspaceScopePlugin);
dashboardLayoutSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const DashboardLayout = mongoose.model('DashboardLayout', dashboardLayoutSchema);
