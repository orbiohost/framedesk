import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { canEdit, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { objectId } from '../../utils/zodHelpers.js';
import { User } from '../users/user.model.js';
import { MAX_ALERT_RECIPIENTS } from './alert.model.js';
import {
  alertSettingsOf,
  alertSettingsSchema,
  alertSettingsUpdate,
  ringOverrideSchema,
} from './alertSettings.js';
import {
  activeAlertsFor,
  alertInbox,
  listProjectAlerts,
  openedProject,
  respondToAlert,
  sendAlert,
} from './alerts.service.js';

// Mounted at /workspaces/:workspaceId/alerts: sending alerts about a project.
export const workspaceAlertsRouter = Router();

const projectParams = z.object({ projectId: objectId });

workspaceAlertsRouter.post(
  '/projects/:projectId',
  canEdit,
  validate({
    params: projectParams,
    body: z.object({
      userIds: z.array(objectId).max(MAX_ALERT_RECIPIENTS).optional(),
      message: z.string().trim().max(300).optional(),
      test: z.boolean().optional(),
      ring: ringOverrideSchema.optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const alert = await sendAlert(
      { workspace: req.workspace, user: req.user, membership: req.membership },
      { projectId: req.params.projectId, ...req.body },
    );
    sendSuccess(res, { alert }, { status: 201 });
  }),
);

workspaceAlertsRouter.get(
  '/projects/:projectId',
  canView,
  validate({ params: projectParams }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, {
      alerts: await listProjectAlerts(req.workspace._id, req.params.projectId),
    });
  }),
);

// My alerts in this workspace (header notifications).
workspaceAlertsRouter.get(
  '/inbox',
  asyncHandler(async (req, res) => {
    sendSuccess(res, { alerts: await alertInbox(req.workspace._id, req.user._id) });
  }),
);

// The project was opened: its alerts stop ringing for this person.
workspaceAlertsRouter.post(
  '/projects/:projectId/opened',
  validate({ params: projectParams }),
  asyncHandler(async (req, res) => {
    const answered = await openedProject(req.workspace._id, req.params.projectId, req.user._id);
    sendSuccess(res, { answered });
  }),
);

// Mounted at /alerts: the signed-in person's ringing alerts and settings.
export const myAlertsRouter = Router();
myAlertsRouter.use(authenticate);

myAlertsRouter.get(
  '/active',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await activeAlertsFor(req.user));
  }),
);

myAlertsRouter.post(
  '/:alertId/respond',
  validate({
    params: z.object({ alertId: objectId }),
    body: z.object({ action: z.enum(['opened', 'dismissed']) }),
  }),
  asyncHandler(async (req, res) => {
    await respondToAlert(req.user, req.params.alertId, req.body.action);
    sendSuccess(res, { ok: true });
  }),
);

myAlertsRouter.get(
  '/settings',
  asyncHandler(async (req, res) => {
    sendSuccess(res, { settings: alertSettingsOf(req.user) });
  }),
);

myAlertsRouter.patch(
  '/settings',
  validate({ body: alertSettingsSchema }),
  asyncHandler(async (req, res) => {
    const set = alertSettingsUpdate(req.body);
    const user = Object.keys(set).length
      ? await User.findByIdAndUpdate(
          req.user._id,
          { $set: set },
          { new: true, runValidators: true },
        )
          .select('alertPrefs')
          .lean()
      : req.user;
    sendSuccess(res, { settings: alertSettingsOf(user) });
  }),
);
