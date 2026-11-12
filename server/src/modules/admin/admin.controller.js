import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as adminService from './admin.service.js';
import { getDashboardMetrics } from './adminMetrics.service.js';
import { getSystemHealth } from './adminSystem.service.js';
import { listAuditLog } from './auditLog.service.js';

export const dashboard = asyncHandler(async (req, res) => {
  sendSuccess(res, await getDashboardMetrics());
});

export const system = asyncHandler(async (req, res) => {
  sendSuccess(res, await getSystemHealth());
});

export const auditLog = asyncHandler(async (req, res) => {
  sendSuccess(res, await listAuditLog(req.query));
});

export const listUpgradeRequests = asyncHandler(async (req, res) => {
  const requests = await adminService.listUpgradeRequests(req.query);
  sendSuccess(res, { requests });
});

export const activateUpgradeRequest = asyncHandler(async (req, res) => {
  await adminService.activateUpgradeRequest(req.params.requestId, req.user._id, req.body);
  sendSuccess(res, { activated: true });
});
