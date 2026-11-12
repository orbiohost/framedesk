import { recordAudit } from '../admin/auditLog.service.js';
import { UpgradeRequest } from '../billing/upgradeRequest.model.js';
import { Event } from '../calendar/event.model.js';
import { Message } from '../chat/message.model.js';
import { Client } from '../clients/client.model.js';
import { DashboardLayout } from '../dashboard/dashboardLayout.model.js';
import { purgeFiles } from '../files/files.service.js';
import { Folder } from '../files/folder.model.js';
import { Membership } from '../members/membership.model.js';
import { Note } from '../notes/note.model.js';
import { Project } from '../projects/project.model.js';
import { QuickNote } from '../quickNotes/quickNote.model.js';
import { Task } from '../tasks/task.model.js';
import { AppError } from '../../utils/AppError.js';
import { Workspace } from './workspace.model.js';

// Everything that belongs to one workspace. Payments are kept on purpose:
// they are the billing record, and admins still need them after a workspace goes.
const WORKSPACE_DATA = [
  Folder,
  Task,
  Event,
  Project,
  Client,
  Message,
  Note,
  QuickNote,
  DashboardLayout,
  UpgradeRequest,
];

async function assertCanDelete(workspace, membership, userId, confirmName) {
  if (membership.role !== 'owner' || String(workspace.ownerId) !== String(userId)) {
    throw AppError.forbidden('Only the workspace owner can delete it', 'OWNER_ONLY');
  }
  if (confirmName.trim() !== workspace.name.trim()) {
    throw AppError.badRequest(
      'Type the workspace name exactly to confirm',
      'CONFIRMATION_MISMATCH',
    );
  }
  // An account workspace holds the plan and storage that others share.
  const sharing = await Workspace.find({ storagePoolId: workspace._id }).select('name').lean();
  if (sharing.length > 0) {
    const names = sharing.map((other) => `"${other.name}"`).join(', ');
    throw AppError.conflict(
      `Other workspaces use this workspace's plan and storage (${names}). Delete them first.`,
      'WORKSPACE_HAS_SHARED',
    );
  }
}

// Deletes a workspace and everything in it, for good. Members lose access first,
// then files (bytes included, shared space given back), then the rest.
export async function deleteWorkspace({ workspace, membership, userId, confirmName }) {
  await assertCanDelete(workspace, membership, userId, confirmName);
  const workspaceId = workspace._id;

  await Membership.deleteMany({ workspaceId });
  const { count: filesDeleted } = await purgeFiles(workspaceId);
  await Promise.all(WORKSPACE_DATA.map((Model) => Model.deleteMany({ workspaceId })));
  await Workspace.deleteOne({ _id: workspaceId });

  await recordAudit({
    actorId: userId,
    action: 'workspace.delete',
    workspaceId,
    details: { name: workspace.name, filesDeleted, billing: workspace.billing },
  });
}
