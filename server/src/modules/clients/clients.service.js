import { AppError } from '../../utils/AppError.js';
import { containsInsensitive, withoutUndefined } from '../../utils/objects.js';
import { Project } from '../projects/project.model.js';
import { Client } from './client.model.js';

const CLOSED_PROJECT_STATUSES = ['completed', 'archived'];

export function toClientDto(client, projectCounts) {
  return {
    id: String(client._id),
    name: client.name,
    company: client.company,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    tags: client.tags,
    archived: Boolean(client.archivedAt),
    projectCount: projectCounts?.total ?? 0,
    openProjectCount: projectCounts?.open ?? 0,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

async function countProjectsByClient(workspaceId, clientIds) {
  const rows = await Project.aggregate([
    { $match: { workspaceId, clientId: { $in: clientIds } } },
    {
      $group: {
        _id: '$clientId',
        total: { $sum: 1 },
        open: { $sum: { $cond: [{ $in: ['$status', CLOSED_PROJECT_STATUSES] }, 0, 1] } },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

async function findClientOrThrow(workspaceId, clientId) {
  const client = await Client.findOne({ _id: clientId, workspaceId }).lean();
  if (!client) throw AppError.notFound('Client not found');
  return client;
}

export async function assertClientExists(workspaceId, clientId) {
  const exists = await Client.exists({ _id: clientId, workspaceId });
  if (!exists)
    throw AppError.badRequest('That client does not exist in this workspace', 'CLIENT_NOT_FOUND');
}

export async function listClients(workspaceId, { q, archived }) {
  const filter = { workspaceId, archivedAt: archived ? { $ne: null } : null };
  if (q) filter.$or = [{ name: containsInsensitive(q) }, { company: containsInsensitive(q) }];

  const clients = await Client.find(filter).sort({ name: 1 }).limit(500).lean();
  const counts = await countProjectsByClient(
    workspaceId,
    clients.map((client) => client._id),
  );
  return clients.map((client) => toClientDto(client, counts.get(String(client._id))));
}

export async function getClient(workspaceId, clientId) {
  const client = await findClientOrThrow(workspaceId, clientId);
  const counts = await countProjectsByClient(workspaceId, [client._id]);
  return toClientDto(client, counts.get(String(client._id)));
}

export async function createClient(workspaceId, userId, input) {
  const client = await Client.create({
    ...withoutUndefined(input),
    workspaceId,
    createdBy: userId,
  });
  return toClientDto(client);
}

export async function updateClient(workspaceId, clientId, input) {
  const client = await Client.findOneAndUpdate(
    { _id: clientId, workspaceId },
    { $set: withoutUndefined(input) },
    { new: true, runValidators: true },
  ).lean();
  if (!client) throw AppError.notFound('Client not found');
  return getClient(workspaceId, client._id);
}

export async function setClientArchived(workspaceId, clientId, archived) {
  const client = await Client.findOneAndUpdate(
    { _id: clientId, workspaceId },
    { $set: { archivedAt: archived ? new Date() : null } },
    { new: true },
  ).lean();
  if (!client) throw AppError.notFound('Client not found');
  return getClient(workspaceId, client._id);
}

// Projects survive the client being deleted; they just lose the link.
export async function deleteClient(workspaceId, clientId) {
  const client = await Client.findOneAndDelete({ _id: clientId, workspaceId }).lean();
  if (!client) throw AppError.notFound('Client not found');
  await Project.updateMany({ workspaceId, clientId: client._id }, { $set: { clientId: null } });
}
