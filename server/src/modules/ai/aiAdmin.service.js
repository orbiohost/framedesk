import { AppError } from '../../utils/AppError.js';
import { containsInsensitive } from '../../utils/objects.js';
import { recordAudit } from '../admin/auditLog.service.js';
import { planName } from '../billing/accountBilling.service.js';
import { effectiveStatus } from '../billing/planLifecycle.service.js';
import { StoredFile } from '../files/file.model.js';
import { PLANS } from '../plans/plans.catalog.js';
import { User } from '../users/user.model.js';
import { findPoolWorkspace } from '../workspaces/storagePool.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { getAiSettings, updateAiSettings } from './aiSettings.service.js';
import { CreditLedger } from './creditLedger.model.js';
import { addCredits, creditBalance, listLedger, resetUsageWindows } from './credits.service.js';
import { geminiKeyHint, isGeminiConfigured } from './gemini.client.js';

const ALL = { crossWorkspace: true };
const DAY_MS = 24 * 60 * 60 * 1000;

async function usage() {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [byKind, states] = await Promise.all([
    CreditLedger.aggregate([
      { $match: { createdAt: { $gte: since }, kind: { $in: ['chat', 'analysis'] } } },
      {
        $group: {
          _id: '$kind',
          credits: { $sum: { $abs: '$credits' } },
          tokens: { $sum: { $ifNull: ['$tokens', 0] } },
          count: { $sum: 1 },
        },
      },
    ]).option(ALL),
    StoredFile.aggregate([
      { $match: { deletedAt: null, category: { $in: ['video', 'audio', 'image', 'document'] } } },
      { $group: { _id: '$aiState', count: { $sum: 1 } } },
    ]).option(ALL),
  ]);
  const kind = (name) =>
    byKind.find((row) => row._id === name) ?? { credits: 0, tokens: 0, count: 0 };
  const state = (name) => states.find((row) => row._id === name)?.count ?? 0;
  return {
    last30Days: { chat: kind('chat'), analysis: kind('analysis') },
    files: {
      analysed: state('done'),
      waiting: state(null) + state('processing'),
      waitingForCredits: state('no_credits'),
      skipped: state('skipped'),
      failed: state('failed'),
    },
  };
}

export async function getAiAdminOverview() {
  return {
    settings: await getAiSettings(),
    gemini: { configured: isGeminiConfigured(), keyHint: geminiKeyHint() },
    plans: PLANS.map((plan) => ({ code: plan.code, name: plan.name })),
    usage: await usage(),
  };
}

export async function saveAiSettings(input, adminId) {
  const settings = await updateAiSettings(input, adminId);
  await recordAudit({ actorId: adminId, action: 'ai.settings_update', details: input });
  return getAiAdminOverview().then((overview) => ({ ...overview, settings }));
}

function toAccountDto(workspace, settings) {
  const owner = workspace.ownerId;
  return {
    workspaceId: String(workspace._id),
    workspaceName: workspace.name,
    owner: owner?.email ? { name: owner.name, email: owner.email } : null,
    planName: workspace.billing?.planCode ? planName(workspace.billing.planCode) : null,
    status: effectiveStatus(workspace.billing ?? {}),
    blocked: Boolean(workspace.ai?.blocked),
    credits: creditBalance(workspace, settings),
  };
}

export async function listAiAccounts({ q }) {
  const settings = await getAiSettings();
  const filter = { storagePoolId: null };
  if (q) {
    const owners = await User.find({ email: containsInsensitive(q) })
      .select('_id')
      .lean();
    filter.$or = [
      { name: containsInsensitive(q) },
      { ownerId: { $in: owners.map((user) => user._id) } },
    ];
  }
  const workspaces = await Workspace.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('ownerId', 'name email')
    .lean();
  return workspaces.map((workspace) => toAccountDto(workspace, settings));
}

async function accountOrThrow(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) throw AppError.notFound('Workspace not found');
  return findPoolWorkspace(workspace);
}

async function accountDto(poolId) {
  const [workspace, settings] = await Promise.all([
    Workspace.findById(poolId).populate('ownerId', 'name email').lean(),
    getAiSettings(),
  ]);
  return toAccountDto(workspace, settings);
}

// Positive credits are a gift; negative takes credits away (never below zero).
export async function adjustCredits(workspaceId, adminId, { credits, note }) {
  const pool = await accountOrThrow(workspaceId);
  await addCredits(pool._id, credits, {
    kind: 'grant',
    userId: adminId,
    note: note || (credits > 0 ? 'Granted by FrameDesk' : 'Removed by FrameDesk'),
  });
  await recordAudit({
    actorId: adminId,
    action: 'ai.credits_adjust',
    workspaceId: pool._id,
    details: { credits, note: note ?? null },
  });
  return accountDto(pool._id);
}

export async function setAccountAccess(workspaceId, adminId, { blocked }) {
  const pool = await accountOrThrow(workspaceId);
  await Workspace.updateOne({ _id: pool._id }, { $set: { 'ai.blocked': blocked } });
  if (!blocked) {
    // Files that waited while it was off get looked at now.
    const workspaces = await Workspace.find({
      $or: [{ _id: pool._id }, { storagePoolId: pool._id }],
    })
      .select('_id')
      .lean();
    await StoredFile.updateMany(
      { workspaceId: { $in: workspaces.map((ws) => ws._id) }, aiState: 'no_credits' },
      { $set: { aiState: null, aiRetryAt: null } },
    ).setOptions(ALL);
  }
  await recordAudit({
    actorId: adminId,
    action: blocked ? 'ai.account_blocked' : 'ai.account_unblocked',
    workspaceId: pool._id,
  });
  return accountDto(pool._id);
}

export async function resetAccountLimits(workspaceId, adminId) {
  const pool = await accountOrThrow(workspaceId);
  await resetUsageWindows(pool._id);
  await recordAudit({ actorId: adminId, action: 'ai.limits_reset', workspaceId: pool._id });
  return accountDto(pool._id);
}

export async function accountLedger(workspaceId, query) {
  const pool = await accountOrThrow(workspaceId);
  return listLedger(pool._id, query);
}
