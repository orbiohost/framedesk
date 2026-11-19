import { ADMIN_ROLES, EDIT_ROLES } from '../members/roles.js';
import { StoredFile } from '../files/file.model.js';
import { QuickNote } from '../quickNotes/quickNote.model.js';
import { visibleTo as notesVisibleTo } from '../quickNotes/quickNotes.service.js';
import { AppError } from '../../utils/AppError.js';
import { AiAgent } from './aiAgent.model.js';
import { AiMemory } from './aiMemory.model.js';

// Custom assistants: CRUD, and who may see or change them.

export function visibleAgents(userId) {
  return { $or: [{ createdBy: userId }, { visibility: 'workspace' }] };
}

function canEditAgent(agent, { user, role }) {
  const mine = String(agent.createdBy?._id ?? agent.createdBy) === String(user._id);
  return mine || (agent.visibility === 'workspace' && ADMIN_ROLES.includes(role));
}

// Names for the knowledge files and notes, skipping any that are gone.
async function knowledgeLabels(workspaceId, agents) {
  const fileIds = [...new Set(agents.flatMap((agent) => agent.fileIds.map(String)))];
  const noteIds = [...new Set(agents.flatMap((agent) => agent.noteIds.map(String)))];
  const [files, notes] = await Promise.all([
    fileIds.length
      ? StoredFile.find({ workspaceId, _id: { $in: fileIds }, deletedAt: null })
          .select('displayName category')
          .lean()
      : [],
    noteIds.length
      ? QuickNote.find({ workspaceId, _id: { $in: noteIds } })
          .select('title body')
          .lean()
      : [],
  ]);
  return {
    files: new Map(files.map((file) => [String(file._id), file])),
    notes: new Map(notes.map((note) => [String(note._id), note])),
  };
}

function toAgentDto(agent, ctx, labels) {
  return {
    id: String(agent._id),
    name: agent.name,
    description: agent.description,
    emoji: agent.emoji,
    color: agent.color,
    instructions: agent.instructions,
    knowledge: agent.knowledge,
    files: agent.fileIds
      .map((id) => labels.files.get(String(id)))
      .filter(Boolean)
      .map((file) => ({ id: String(file._id), name: file.displayName, category: file.category })),
    notes: agent.noteIds
      .map((id) => labels.notes.get(String(id)))
      .filter(Boolean)
      .map((note) => ({
        id: String(note._id),
        title: note.title || note.body?.slice(0, 60) || 'Untitled',
      })),
    skills: agent.skills,
    starters: agent.starters,
    creativity: agent.creativity,
    useMemory: agent.useMemory,
    visibility: agent.visibility,
    createdBy: agent.createdBy?.name
      ? { id: String(agent.createdBy._id), name: agent.createdBy.name }
      : null,
    canEdit: canEditAgent(agent, ctx),
    updatedAt: agent.updatedAt,
  };
}

export async function listAgents(ctx) {
  const agents = await AiAgent.find({
    workspaceId: ctx.workspace._id,
    ...visibleAgents(ctx.user._id),
  })
    .sort({ updatedAt: -1 })
    .populate('createdBy', 'name')
    .lean();
  const labels = await knowledgeLabels(ctx.workspace._id, agents);
  return agents.map((agent) => toAgentDto(agent, ctx, labels));
}

async function getAgentDto(ctx, agentId) {
  const agent = await AiAgent.findOne({ _id: agentId, workspaceId: ctx.workspace._id })
    .populate('createdBy', 'name')
    .lean();
  const labels = await knowledgeLabels(ctx.workspace._id, [agent]);
  return toAgentDto(agent, ctx, labels);
}

// An assistant the person may ask; null when it is gone or private to someone else.
export async function findUsableAgent(workspaceId, userId, agentId) {
  if (!agentId) return null;
  return AiAgent.findOne({ _id: agentId, workspaceId, ...visibleAgents(userId) }).lean();
}

async function findEditableAgent(ctx, agentId) {
  const agent = await findUsableAgent(ctx.workspace._id, ctx.user._id, agentId);
  if (!agent) throw AppError.notFound('Assistant not found', 'AGENT_NOT_FOUND');
  if (!canEditAgent(agent, ctx)) {
    throw AppError.forbidden('Only its creator or an admin can change this assistant');
  }
  return agent;
}

function assertCanShare(visibility, role) {
  if (visibility === 'workspace' && !EDIT_ROLES.includes(role)) {
    throw AppError.forbidden('Only editors and above can share assistants with the workspace');
  }
}

// Knowledge must be files and notes the creator can actually open.
async function assertKnowledge(ctx, { fileIds, noteIds }) {
  if (fileIds?.length) {
    const found = await StoredFile.countDocuments({
      workspaceId: ctx.workspace._id,
      _id: { $in: fileIds },
      deletedAt: null,
    });
    if (found !== new Set(fileIds).size) {
      throw AppError.badRequest('A knowledge file was not found', 'FILE_NOT_FOUND');
    }
  }
  if (noteIds?.length) {
    const found = await QuickNote.countDocuments({
      workspaceId: ctx.workspace._id,
      _id: { $in: noteIds },
      ...notesVisibleTo(ctx.user._id),
    });
    if (found !== new Set(noteIds).size) {
      throw AppError.badRequest('A knowledge note was not found', 'NOTE_NOT_FOUND');
    }
  }
}

export async function createAgent(ctx, input) {
  assertCanShare(input.visibility, ctx.role);
  await assertKnowledge(ctx, input);
  const agent = await AiAgent.create({
    ...input,
    workspaceId: ctx.workspace._id,
    createdBy: ctx.user._id,
  });
  return getAgentDto(ctx, agent._id);
}

export async function updateAgent(ctx, agentId, input) {
  await findEditableAgent(ctx, agentId);
  if (input.visibility) assertCanShare(input.visibility, ctx.role);
  await assertKnowledge(ctx, input);
  await AiAgent.updateOne(
    { _id: agentId, workspaceId: ctx.workspace._id },
    { $set: input },
    { runValidators: true },
  );
  return getAgentDto(ctx, agentId);
}

export async function deleteAgent(ctx, agentId) {
  await findEditableAgent(ctx, agentId);
  await Promise.all([
    AiAgent.deleteOne({ _id: agentId, workspaceId: ctx.workspace._id }),
    AiMemory.deleteMany({ workspaceId: ctx.workspace._id, agentId }),
  ]);
}
