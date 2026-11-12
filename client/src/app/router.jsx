import { createBrowserRouter } from 'react-router-dom';
import { RequireSuperadmin } from '../features/admin/RequireSuperadmin.jsx';
import { GuestOnly } from '../features/auth/GuestOnly.jsx';
import { RequireAuth } from '../features/auth/RequireAuth.jsx';
import { TeamOnly } from '../features/workspaces/TeamOnly.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';

// After a deploy, a tab opened earlier still runs the old build and asks for
// page files that no longer exist. Reloading once picks up the new build; the
// timestamp stops a reload loop if the files are missing for another reason.
const RELOAD_KEY = 'app:reloaded-for-new-version';
const RELOAD_GUARD_MS = 30 * 1000;

function reloadOntoNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    if (last && Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false; // No storage, no loop guard: show the error instead.
  }
  window.location.reload();
  return true;
}

// Pages load on demand, so a visitor on the website never downloads the app,
// and opening Tasks doesn't download the calendar. Guards stay in the main bundle.
function page(load, exportName) {
  return async () => {
    try {
      return { Component: (await load())[exportName] };
    } catch (error) {
      // Never resolves while the page reloads, so no error screen flashes.
      if (reloadOntoNewVersion()) return new Promise(() => {});
      throw error;
    }
  };
}

export const router = createBrowserRouter([
  {
    lazy: page(() => import('../layouts/MarketingLayout.jsx'), 'MarketingLayout'),
    children: [
      { path: '/', lazy: page(() => import('../pages/marketing/HomePage.jsx'), 'HomePage') },
    ],
  },

  {
    element: <GuestOnly />,
    children: [
      { path: '/login', lazy: page(() => import('../pages/auth/LoginPage.jsx'), 'LoginPage') },
      { path: '/signup', lazy: page(() => import('../pages/auth/SignupPage.jsx'), 'SignupPage') },
      {
        path: '/forgot-password',
        lazy: page(() => import('../pages/auth/ForgotPasswordPage.jsx'), 'ForgotPasswordPage'),
      },
    ],
  },
  // These work whether or not the person is signed in.
  {
    path: '/reset-password',
    lazy: page(() => import('../pages/auth/ResetPasswordPage.jsx'), 'ResetPasswordPage'),
  },
  {
    path: '/verify-email',
    lazy: page(() => import('../pages/auth/VerifyEmailPage.jsx'), 'VerifyEmailPage'),
  },
  // A project someone shared by link. The server decides whether signing in is needed.
  {
    path: '/share/:token',
    lazy: page(() => import('../pages/share/SharedProjectPage.jsx'), 'SharedProjectPage'),
  },

  {
    element: <RequireAuth />,
    children: [
      {
        path: '/app',
        lazy: page(() => import('../pages/app/WorkspaceRedirectPage.jsx'), 'WorkspaceRedirectPage'),
      },
      {
        path: '/app/new-workspace',
        lazy: page(() => import('../pages/app/NewWorkspacePage.jsx'), 'NewWorkspacePage'),
      },
      {
        element: <RequireSuperadmin />,
        children: [
          {
            path: '/admin',
            lazy: page(() => import('../layouts/AdminLayout.jsx'), 'AdminLayout'),
            children: [
              {
                index: true,
                lazy: page(
                  () => import('../pages/admin/AdminDashboardPage.jsx'),
                  'AdminDashboardPage',
                ),
              },
              {
                path: 'users',
                lazy: page(() => import('../pages/admin/AdminUsersPage.jsx'), 'AdminUsersPage'),
              },
              {
                path: 'subscriptions',
                lazy: page(
                  () => import('../pages/admin/AdminSubscriptionsPage.jsx'),
                  'AdminSubscriptionsPage',
                ),
              },
              {
                path: 'sales',
                lazy: page(() => import('../pages/admin/AdminSalesPage.jsx'), 'AdminSalesPage'),
              },
              {
                path: 'upgrade-requests',
                lazy: page(
                  () => import('../pages/admin/UpgradeRequestsPage.jsx'),
                  'UpgradeRequestsPage',
                ),
              },
              {
                path: 'audit-log',
                lazy: page(() => import('../pages/admin/AdminAuditPage.jsx'), 'AdminAuditPage'),
              },
              {
                path: 'system',
                lazy: page(() => import('../pages/admin/AdminSystemPage.jsx'), 'AdminSystemPage'),
              },
            ],
          },
        ],
      },
      {
        path: '/w/:workspaceId',
        lazy: page(() => import('../layouts/AppLayout.jsx'), 'AppLayout'),
        children: [
          {
            index: true,
            lazy: page(() => import('../pages/app/WorkspaceHomePage.jsx'), 'WorkspaceHomePage'),
          },
          {
            element: <TeamOnly />,
            children: [
              {
                path: 'projects',
                lazy: page(() => import('../pages/app/projects/ProjectsPage.jsx'), 'ProjectsPage'),
              },
              {
                path: 'projects/:projectId',
                lazy: page(
                  () => import('../pages/app/projects/ProjectLayout.jsx'),
                  'ProjectLayout',
                ),
                children: [
                  {
                    index: true,
                    lazy: page(
                      () => import('../pages/app/projects/ProjectOverviewPage.jsx'),
                      'ProjectOverviewPage',
                    ),
                  },
                  {
                    path: 'files',
                    lazy: page(
                      () => import('../pages/app/projects/ProjectFilesPage.jsx'),
                      'ProjectFilesPage',
                    ),
                  },
                  {
                    path: 'tasks',
                    lazy: page(
                      () => import('../pages/app/projects/ProjectTasksPage.jsx'),
                      'ProjectTasksPage',
                    ),
                  },
                  {
                    path: 'calendar',
                    lazy: page(
                      () => import('../pages/app/projects/ProjectCalendarPage.jsx'),
                      'ProjectCalendarPage',
                    ),
                  },
                  {
                    path: 'notes',
                    lazy: page(
                      () => import('../pages/app/projects/ProjectNotesPage.jsx'),
                      'ProjectNotesPage',
                    ),
                  },
                ],
              },
              {
                path: 'drive',
                lazy: page(() => import('../pages/app/DrivePage.jsx'), 'DrivePage'),
              },
              {
                path: 'transcribe',
                lazy: page(() => import('../pages/app/TranscribePage.jsx'), 'TranscribePage'),
              },
              {
                path: 'clients',
                lazy: page(() => import('../pages/app/ClientsPage.jsx'), 'ClientsPage'),
              },
              {
                path: 'clients/:clientId',
                lazy: page(() => import('../pages/app/ClientDetailPage.jsx'), 'ClientDetailPage'),
              },
              {
                path: 'tasks',
                lazy: page(() => import('../pages/app/MyTasksPage.jsx'), 'MyTasksPage'),
              },
              {
                path: 'notes',
                lazy: page(() => import('../pages/app/QuickNotesPage.jsx'), 'QuickNotesPage'),
              },
              {
                path: 'calendar',
                lazy: page(() => import('../pages/app/CalendarPage.jsx'), 'CalendarPage'),
              },
            ],
          },
          {
            path: 'upgrade',
            lazy: page(() => import('../pages/app/UpgradePage.jsx'), 'UpgradePage'),
          },
          {
            path: 'backup',
            lazy: page(() => import('../pages/app/BackupPage.jsx'), 'BackupPage'),
          },
          {
            path: 'settings',
            lazy: page(
              () => import('../pages/app/WorkspaceSettingsPage.jsx'),
              'WorkspaceSettingsPage',
            ),
          },
          {
            path: 'account',
            lazy: page(() => import('../pages/app/AccountPage.jsx'), 'AccountPage'),
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
]);
