import mongoose, { Schema } from 'mongoose';

// Every admin action leaves a record: who did what, to which workspace, when.
const auditLogSchema = new Schema(
  {
    // null for events the payment provider reports (refunds, disputes).
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ workspaceId: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
