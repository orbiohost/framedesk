import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';
import aiAdminRoutes from '../ai/aiAdmin.routes.js';
import * as admin from './admin.controller.js';
import * as billing from './adminBilling.controller.js';
import * as invoicing from './adminInvoicing.controller.js';
import * as users from './adminUsers.controller.js';
import * as support from '../support/support.controller.js';
import {
  adminTicketsQuerySchema,
  adminUpdateTicketSchema,
  ticketIdParam,
} from '../support/support.validation.js';
import {
  activateRequestSchema,
  adjustSubscriptionSchema,
  billingSettingsSchema,
  cursorQuery,
  idParam,
  paymentsQuerySchema,
  recordPaymentSchema,
  subscriptionsQuerySchema,
  upgradeRequestsQuerySchema,
  userStatusSchema,
  usersQuerySchema,
} from './admin.validation.js';

// Answers 404 to everyone else, so the admin area isn't advertised.
function requireSuperadmin(req, res, next) {
  if (!req.user?.isSuperadmin) return next(AppError.notFound());
  next();
}

const router = Router();
router.use(authenticate, requireSuperadmin);

router.get('/dashboard', admin.dashboard);
router.get('/system', admin.system);
router.use('/ai', aiAdminRoutes);
router.get('/audit-log', validate({ query: cursorQuery }), admin.auditLog);

router.get('/users', validate({ query: usersQuerySchema }), users.list);
router.get('/users/:userId', validate({ params: idParam('userId') }), users.detail);
router.post(
  '/users/:userId/status',
  validate({ params: idParam('userId'), body: userStatusSchema }),
  users.setStatus,
);

router.get(
  '/subscriptions',
  validate({ query: subscriptionsQuerySchema }),
  billing.listSubscriptions,
);
router.post(
  '/subscriptions/:workspaceId/adjust',
  validate({ params: idParam('workspaceId'), body: adjustSubscriptionSchema }),
  billing.adjustSubscription,
);
router.post(
  '/subscriptions/:workspaceId/payments',
  validate({ params: idParam('workspaceId'), body: recordPaymentSchema }),
  billing.recordPayment,
);

router.get('/payments', validate({ query: paymentsQuerySchema }), billing.payments);
router.get('/payments/export', validate({ query: paymentsQuerySchema }), billing.paymentsExport);

router.get('/billing-settings', invoicing.getSettings);
router.put(
  '/billing-settings',
  validate({ body: billingSettingsSchema }),
  invoicing.updateSettings,
);
router.get('/billing-settings/sample-pdf', invoicing.samplePdf);

router.get(
  '/upgrade-requests',
  validate({ query: upgradeRequestsQuerySchema }),
  admin.listUpgradeRequests,
);
router.post(
  '/upgrade-requests/:requestId/activate',
  validate({ params: idParam('requestId'), body: activateRequestSchema }),
  admin.activateUpgradeRequest,
);

router.get('/support', validate({ query: adminTicketsQuerySchema }), support.adminList);
router.patch(
  '/support/:ticketId',
  validate({ params: ticketIdParam, body: adminUpdateTicketSchema }),
  support.adminUpdate,
);

export default router;
