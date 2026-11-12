import { AuditLog } from './auditLog.model.js';

export function recordAudit({ actorId, action, workspaceId = null, details = {} }) {
  return AuditLog.create({ actorId, action, workspaceId, details });
}

const PAGE_SIZE = 50;

export async function listAuditLog({ cursor }) {
  const filter = cursor ? { _id: { $lt: cursor } } : {};
  const entries = await AuditLog.find(filter)
    .sort({ _id: -1 })
    .limit(PAGE_SIZE + 1)
    .populate('actorId', 'name email')
    .populate('workspaceId', 'name')
    .lean();

  const hasMore = entries.length > PAGE_SIZE;
  const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries;
  return {
    entries: page.map((entry) => ({
      id: String(entry._id),
      action: entry.action,
      actor: entry.actorId ? { name: entry.actorId.name, email: entry.actorId.email } : null,
      workspace: entry.workspaceId
        ? { id: String(entry.workspaceId._id), name: entry.workspaceId.name }
        : null,
      details: entry.details,
      at: entry.createdAt,
    })),
    nextCursor: hasMore ? String(page.at(-1)._id) : null,
  };
}
