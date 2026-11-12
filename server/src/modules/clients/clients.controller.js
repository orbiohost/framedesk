import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as clientsService from './clients.service.js';

export const list = asyncHandler(async (req, res) => {
  const clients = await clientsService.listClients(req.workspace._id, req.query);
  sendSuccess(res, { clients });
});

export const getOne = asyncHandler(async (req, res) => {
  const client = await clientsService.getClient(req.workspace._id, req.params.clientId);
  sendSuccess(res, { client });
});

export const create = asyncHandler(async (req, res) => {
  const client = await clientsService.createClient(req.workspace._id, req.user._id, req.body);
  sendSuccess(res, { client }, { status: 201 });
});

export const update = asyncHandler(async (req, res) => {
  const client = await clientsService.updateClient(
    req.workspace._id,
    req.params.clientId,
    req.body,
  );
  sendSuccess(res, { client });
});

export const archive = asyncHandler(async (req, res) => {
  const client = await clientsService.setClientArchived(
    req.workspace._id,
    req.params.clientId,
    true,
  );
  sendSuccess(res, { client });
});

export const restore = asyncHandler(async (req, res) => {
  const client = await clientsService.setClientArchived(
    req.workspace._id,
    req.params.clientId,
    false,
  );
  sendSuccess(res, { client });
});

export const remove = asyncHandler(async (req, res) => {
  await clientsService.deleteClient(req.workspace._id, req.params.clientId);
  sendSuccess(res, { deleted: true });
});
