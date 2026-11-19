import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

// A project alert: someone rings teammates about a project. Each recipient's
// devices get a push (repeated every few minutes) and the open app rings,
// until that person opens the project or dismisses the alert.

export const RECIPIENT_STATUSES = ['ringing', 'opened', 'dismissed', 'expired', 'blocked'];
// "Forever" still ends here (the alert is deleted a day later).
export const ALERT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ALERT_RECIPIENTS = 50;

const recipientSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: RECIPIENT_STATUSES, default: 'ringing' },
    // Pushes sent so far (the first one included).
    sends: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    // When the worker sends the next repeat; null once it stopped.
    nextAt: { type: Date, default: null },
    // Devices that accepted the last push (0: none set up, or all failed).
    delivered: { type: Number, default: 0 },
    respondedAt: { type: Date, default: null },
  },
  { _id: false },
);

const projectAlertSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    projectTitle: { type: String, maxlength: 160, required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, maxlength: 120, default: '' },
    message: { type: String, maxlength: 300, default: '' },
    recipients: { type: [recipientSchema], default: [] },
    // The sender's choices for this alert (empty: each person's own settings).
    ring: {
      ringSeconds: { type: Number, min: 3, max: 300, default: undefined },
      repeatMinutes: { type: Number, min: 1, max: 1440, default: undefined },
      maxRepeats: { type: Number, min: 0, max: 1000, default: undefined },
    },
    // "Test alert" from the settings: rings only the sender, once.
    test: { type: Boolean, default: false },
    // Removed eight days after it was sent.
    createdAt: { type: Date, default: Date.now, expires: 8 * 24 * 60 * 60 },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

projectAlertSchema.plugin(workspaceScopePlugin);
projectAlertSchema.index({ 'recipients.userId': 1, 'recipients.status': 1 });
projectAlertSchema.index({ 'recipients.status': 1, 'recipients.nextAt': 1 });
projectAlertSchema.index({ workspaceId: 1, projectId: 1, createdAt: -1 });

export const ProjectAlert = mongoose.model('ProjectAlert', projectAlertSchema);
