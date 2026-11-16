import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { loadWorkspace } from '../middleware/loadWorkspace.js';
import { optionalAuthenticate } from '../middleware/optionalAuthenticate.js';
import adminRoutes from './admin/admin.routes.js';
import aiRoutes from './ai/ai.routes.js';
import authRoutes from './auth/auth.routes.js';
import { backupDownloadsRouter, workspaceBackupsRouter } from './backups/backups.routes.js';
import briefsRoutes from './briefs/briefs.routes.js';
import checkoutRoutes from './billing/checkout.routes.js';
import upgradeRequestsRoutes from './billing/upgradeRequests.routes.js';
import calendarRoutes from './calendar/calendar.routes.js';
import chatRoutes from './chat/chat.routes.js';
import clientsRoutes from './clients/clients.routes.js';
import connectorsRoutes from './connectors/connectors.routes.js';
import dashboardRoutes from './dashboard/dashboard.routes.js';
import { fileSharesRouter, publicFileShareRouter } from './fileShare/fileShare.routes.js';
import filesRoutes from './files/files.routes.js';
import foldersRoutes from './files/folders.routes.js';
import membersRoutes from './members/members.routes.js';
import moodboardsRoutes from './moodboards/moodboards.routes.js';
import notesRoutes from './notes/notes.routes.js';
import notificationsRoutes from './notifications/notifications.routes.js';
import plansRoutes from './plans/plans.routes.js';
import { publicShareRouter } from './projectShare/projectShare.routes.js';
import projectSettingsRoutes from './projects/projectSettings.routes.js';
import projectsRoutes from './projects/projects.routes.js';
import supportRoutes from './support/support.routes.js';
import quickNotesRoutes from './quickNotes/quickNotes.routes.js';
import referralsRoutes from './referrals/referrals.routes.js';
import searchRoutes from './search/search.routes.js';
import socialRoutes, { socialOAuthRouter } from './social/social.routes.js';
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
// Reminder settings and the devices (phones, browsers) that receive them.
apiRouter.use('/notifications', notificationsRoutes);
apiRouter.use('/plans', plansRoutes);
apiRouter.use('/support', supportRoutes);
// AI connectors: connected assistants, API keys and the OAuth consent screen.
apiRouter.use('/connectors', connectorsRoutes);
// Refer & earn: your referral link, and claiming the one you signed up with.
apiRouter.use('/referrals', referralsRoutes);
// Where Instagram, Facebook, Google and TikTok send people back after linking an account.
apiRouter.use('/social/oauth', socialOAuthRouter);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/backup-downloads', backupDownloadsRouter);
// Shared project links: open to anyone holding the link (or any signed-in
// account, as the link's settings say), no workspace membership needed.
apiRouter.use('/share/:token', optionalAuthenticate, publicShareRouter);
// Links to one file or a hand-picked set of files, open the same way.
apiRouter.use('/file-share/:token', optionalAuthenticate, publicFileShareRouter);

mountWorkspaceFeature('members', membersRoutes);
mountWorkspaceFeature('clients', clientsRoutes);
mountWorkspaceFeature('projects', projectsRoutes);
mountWorkspaceFeature('project-settings', projectSettingsRoutes);
mountWorkspaceFeature('tasks', tasksRoutes);
mountWorkspaceFeature('calendar', calendarRoutes);
mountWorkspaceFeature('chat', chatRoutes);
mountWorkspaceFeature('notes', notesRoutes);
mountWorkspaceFeature('quick-notes', quickNotesRoutes);
mountWorkspaceFeature('moodboards', moodboardsRoutes);
mountWorkspaceFeature('dashboard', dashboardRoutes);
mountWorkspaceFeature('folders', foldersRoutes);
mountWorkspaceFeature('files', filesRoutes);
mountWorkspaceFeature('file-shares', fileSharesRouter);
mountWorkspaceFeature('transcripts', transcriptsRoutes);
mountWorkspaceFeature('upgrade-requests', upgradeRequestsRoutes);
mountWorkspaceFeature('checkout', checkoutRoutes);
mountWorkspaceFeature('backups', workspaceBackupsRouter);
mountWorkspaceFeature('ai', aiRoutes);
mountWorkspaceFeature('briefs', briefsRoutes);
mountWorkspaceFeature('search', searchRoutes);
mountWorkspaceFeature('social', socialRoutes);

apiRouter.use('/workspaces', workspacesRoutes);
