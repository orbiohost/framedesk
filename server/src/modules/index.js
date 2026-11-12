import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { loadWorkspace } from '../middleware/loadWorkspace.js';
import { optionalAuthenticate } from '../middleware/optionalAuthenticate.js';
import adminRoutes from './admin/admin.routes.js';
import authRoutes from './auth/auth.routes.js';
import { backupDownloadsRouter, workspaceBackupsRouter } from './backups/backups.routes.js';
import upgradeRequestsRoutes from './billing/upgradeRequests.routes.js';
import calendarRoutes from './calendar/calendar.routes.js';
import chatRoutes from './chat/chat.routes.js';
import clientsRoutes from './clients/clients.routes.js';
import dashboardRoutes from './dashboard/dashboard.routes.js';
import filesRoutes from './files/files.routes.js';
import foldersRoutes from './files/folders.routes.js';
import membersRoutes from './members/members.routes.js';
import notesRoutes from './notes/notes.routes.js';
import plansRoutes from './plans/plans.routes.js';
import { publicShareRouter } from './projectShare/projectShare.routes.js';
import projectsRoutes from './projects/projects.routes.js';
import quickNotesRoutes from './quickNotes/quickNotes.routes.js';
import tasksRoutes from './tasks/tasks.routes.js';
import transcriptsRoutes from './transcripts/transcripts.routes.js';
import avatarsRoutes from './users/avatars.routes.js';
import usersRoutes from './users/users.routes.js';
import workspacesRoutes from './workspaces/workspaces.routes.js';

// Each feature module exposes one router. Workspace-scoped features mount under
// /workspaces/:workspaceId/<feature>, always behind authenticate + loadWorkspace,
// so their handlers can rely on req.workspace and req.membership.
export const apiRouter = Router();

function mountWorkspaceFeature(path, router) {
  apiRouter.use(`/workspaces/:workspaceId/${path}`, authenticate, loadWorkspace, router);
}

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', usersRoutes);
apiRouter.use('/avatars', avatarsRoutes);
apiRouter.use('/plans', plansRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/backup-downloads', backupDownloadsRouter);
// Shared project links: open to anyone holding the link (or any signed-in
// account, as the link's settings say), no workspace membership needed.
apiRouter.use('/share/:token', optionalAuthenticate, publicShareRouter);

mountWorkspaceFeature('members', membersRoutes);
mountWorkspaceFeature('clients', clientsRoutes);
mountWorkspaceFeature('projects', projectsRoutes);
mountWorkspaceFeature('tasks', tasksRoutes);
mountWorkspaceFeature('calendar', calendarRoutes);
mountWorkspaceFeature('chat', chatRoutes);
mountWorkspaceFeature('notes', notesRoutes);
mountWorkspaceFeature('quick-notes', quickNotesRoutes);
mountWorkspaceFeature('dashboard', dashboardRoutes);
mountWorkspaceFeature('folders', foldersRoutes);
mountWorkspaceFeature('files', filesRoutes);
mountWorkspaceFeature('transcripts', transcriptsRoutes);
mountWorkspaceFeature('upgrade-requests', upgradeRequestsRoutes);
mountWorkspaceFeature('backups', workspaceBackupsRouter);

apiRouter.use('/workspaces', workspacesRoutes);
