import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const EVENT_TYPES = ['shoot', 'meeting', 'delivery', 'review_call', 'custom'];

const eventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: EVENT_TYPES, default: 'custom' },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    assigneeIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    location: { type: String, trim: true, maxlength: 200, default: null },
    notes: { type: String, maxlength: 5000, default: null },
    // Minutes before to send a reminder (see notifications/reminderRules.js).
    // Missing or null: the default for the kind of item; []: no reminders.
    reminders: { type: [Number], default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

eventSchema.plugin(workspaceScopePlugin);
eventSchema.index({ workspaceId: 1, startsAt: 1 });
eventSchema.index({ workspaceId: 1, projectId: 1, startsAt: 1 });

export const Event = mongoose.model('Event', eventSchema);
