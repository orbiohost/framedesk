import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { effectiveStatus } from '../billing/planLifecycle.service.js';
import { StoredFile } from '../files/file.model.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { getAiSettings, SESSION_HOURS, WEEK_DAYS } from './aiSettings.service.js';
import { CreditLedger } from './creditLedger.model.js';

// AI usage lives on the account (storage pool) workspace, shared by every
// workspace of that owner, and works like Claude's limits:
//  - a 5-hour session: starts with the first request after the last session
//    ended, and allows the plan's session limit within it;
//  - a 7-day week, the same way, with the plan's weekly limit;
//  - "extra usage": purchased and admin-granted credits that never expire,
//    used only once a limit is reached.
// Everything is counted in credits (Gemini tokens / tokensPerCredit), but
// people see percentages and reset times.

const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;
const WEEK_MS = WEEK_DAYS * 24 * 60 * 60 * 1000;
const MAX_SPEND_RETRIES = 6;

export function planLimits(pool, settings) {
  const status = effectiveStatus(pool.billing ?? {});
  if (status === 'free') return settings.freeLimits;
  if (status === 'trialing') return settings.trialLimits;
  if (status === 'active' || status === 'past_due') {
    return settings.planLimits[pool.billing.planCode] ?? { session: 0, weekly: 0 };
  }
  return { session: 0, weekly: 0 };
}

// A window that ran out starts over (with nothing used) at the next request.
function windowOf(startedAt, used, lengthMs, now) {
  const start = startedAt ? new Date(startedAt) : null;
  const live = start && now - start < lengthMs;
  return {
    startedAt: live ? start : null,
    used: live ? used || 0 : 0,
    resetsAt: live ? new Date(start.getTime() + lengthMs) : null,
  };
}

function stateOf(pool, settings, now = new Date()) {
  const ai = pool.ai ?? {};
  const limits = planLimits(pool, settings);
  const session = windowOf(ai.sessionStartedAt, ai.sessionUsed, SESSION_MS, now);
  const week = windowOf(ai.weekStartedAt, ai.weekUsed, WEEK_MS, now);
  const sessionLeft = Math.max(0, limits.session - session.used);
  const weekLeft = Math.max(0, limits.weekly - week.used);
  return {
    limits,
    session,
    week,
    planLeft: Math.min(sessionLeft, weekLeft),
    extra: Math.max(0, ai.purchasedCredits ?? 0),
  };
}

function percent(used, limit) {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

/**
 * What the account has left, as people see it. `total` is what can still be
 * spent right now (plan limits first, then extra usage).
 */
export function creditBalance(pool, settings, now = new Date()) {
  const state = stateOf(pool, settings, now);
  const sessionFull = state.session.used >= state.limits.session;
  const weekFull = state.week.used >= state.limits.weekly;
  return {
    total: state.planLeft + state.extra,
    session: {
      percent: percent(state.session.used, state.limits.session),
      resetsAt: state.session.resetsAt,
      hours: SESSION_HOURS,
    },
    weekly: {
      percent: percent(state.week.used, state.limits.weekly),
      resetsAt: state.week.resetsAt,
      days: WEEK_DAYS,
    },
    extra: state.extra,
    // Which limit stops plan usage right now, if any.
    limitedBy: weekFull ? 'weekly' : sessionFull ? 'session' : null,
    usingExtra: state.planLeft === 0 && state.extra > 0,
  };
}

export async function getCreditBalance(poolId, settings) {
  const [pool, resolved] = await Promise.all([
    Workspace.findById(poolId).lean(),
    settings ?? getAiSettings(),
  ]);
  if (!pool) throw AppError.notFound('Workspace not found');
  return creditBalance(pool, resolved);
}

// Credits an action costs, from the tokens Gemini reports.
export function creditsForTokens(tokens, settings, minimum) {
  return Math.max(minimum, Math.ceil((tokens || 0) / settings.tokensPerCredit));
}

// Matches the value read, including "never set" on workspaces older than this.
function unchangedNumber(value) {
  return value === undefined || value === null ? { $in: [0, null] } : value;
}

function unchangedDate(value) {
  return value ? new Date(value) : null;
}

/**
 * Takes up to `amount` credits: from the plan's windows first, then extra
 * usage. Never goes below zero: an answer that turned out dearer than what was
 * left is let off the difference. Optimistic concurrency, so parallel chats
 * can't double-spend. Returns { spent, balance }.
 */
export async function spendCredits(poolId, amount, entry) {
  const settings = await getAiSettings();
  for (let attempt = 0; attempt < MAX_SPEND_RETRIES; attempt += 1) {
    const pool = await Workspace.findById(poolId).lean();
    if (!pool) throw AppError.notFound('Workspace not found');
    const now = new Date();
    const state = stateOf(pool, settings, now);
    const fromPlan = Math.min(amount, state.planLeft);
    const fromExtra = Math.min(amount - fromPlan, state.extra);
    const spent = fromPlan + fromExtra;
    if (spent <= 0) return { spent: 0, balance: creditBalance(pool, settings, now) };

    const ai = pool.ai ?? {};
    const result = await Workspace.updateOne(
      {
        _id: poolId,
        'ai.sessionStartedAt': unchangedDate(ai.sessionStartedAt),
        'ai.sessionUsed': unchangedNumber(ai.sessionUsed),
        'ai.weekStartedAt': unchangedDate(ai.weekStartedAt),
        'ai.weekUsed': unchangedNumber(ai.weekUsed),
        'ai.purchasedCredits': unchangedNumber(ai.purchasedCredits),
      },
      {
        $set: {
          // Plan usage counts in both windows; a window opens on first use.
          'ai.sessionStartedAt': state.session.startedAt ?? now,
          'ai.sessionUsed': state.session.used + fromPlan,
          'ai.weekStartedAt': state.week.startedAt ?? now,
          'ai.weekUsed': state.week.used + fromPlan,
          'ai.purchasedCredits': state.extra - fromExtra,
        },
      },
    );
    if (result.modifiedCount !== 1) continue; // someone else spent meanwhile; read again

    await CreditLedger.create({
      workspaceId: poolId,
      credits: -spent,
      balanceAfter: state.planLeft - fromPlan + state.extra - fromExtra,
      ...entry,
    }).catch((err) => logger.error({ err }, 'Could not write credit ledger entry'));
    const updated = await Workspace.findById(poolId).lean();
    return { spent, balance: creditBalance(updated, settings) };
  }
  throw AppError.conflict('Your usage is being updated elsewhere right now. Please try again.');
}

// The plan code a reset is priced by: 'free', 'trial' during an old trial, else the plan.
export function resetPriceFor(pool, settings) {
  const status = effectiveStatus(pool.billing ?? {});
  const code =
    status === 'free'
      ? 'free'
      : status === 'trialing'
        ? 'trial'
        : ['active', 'past_due'].includes(status)
          ? pool.billing.planCode
          : null;
  if (!code) return null;
  const price = settings.resetPrices[code];
  return price > 0 ? price : null;
}

// Start both windows over, as if the account hadn't used any (admin or paid reset).
export async function resetUsageWindows(poolId) {
  await Workspace.updateOne(
    { _id: poolId },
    {
      $set: {
        'ai.sessionStartedAt': null,
        'ai.sessionUsed': 0,
        'ai.weekStartedAt': null,
        'ai.weekUsed': 0,
      },
    },
  );
}

// Files that waited for credits are picked up again by the analysis worker.
async function wakeWaitingFiles(poolId) {
  const workspaces = await Workspace.find({ $or: [{ _id: poolId }, { storagePoolId: poolId }] })
    .select('_id')
    .lean();
  await StoredFile.updateMany(
    { workspaceId: { $in: workspaces.map((ws) => ws._id) }, aiState: 'no_credits' },
    { $set: { aiState: null, aiRetryAt: null } },
  ).setOptions({ crossWorkspace: true });
}

/**
 * Adds (or, with a negative amount, removes) purchased/granted credits.
 * With a paymentId the change happens once per payment and kind.
 * Returns the ledger entry, or null when this payment was already counted.
 */
export async function addCredits(poolId, amount, { kind, userId = null, paymentId = null, note }) {
  const credits = Math.trunc(amount);
  if (!credits) return null;
  let entry;
  try {
    entry = await CreditLedger.create({
      workspaceId: poolId,
      kind,
      credits,
      userId,
      paymentId,
      note: note ?? null,
    });
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }

  if (credits > 0) {
    await Workspace.updateOne({ _id: poolId }, { $inc: { 'ai.purchasedCredits': credits } });
  } else {
    // Never below zero: take what is there.
    await Workspace.updateOne({ _id: poolId }, [
      {
        $set: {
          'ai.purchasedCredits': {
            $max: [0, { $add: [{ $ifNull: ['$ai.purchasedCredits', 0] }, credits] }],
          },
        },
      },
    ]);
  }
  const balance = await getCreditBalance(poolId);
  await CreditLedger.updateOne(
    { _id: entry._id, workspaceId: poolId },
    { $set: { balanceAfter: balance.total } },
  );
  if (credits > 0) await wakeWaitingFiles(poolId).catch(() => {});
  return { ...entry.toObject(), balanceAfter: balance.total };
}

const HISTORY_PAGE = 30;

export async function listLedger(poolId, { cursor } = {}) {
  const filter = { workspaceId: poolId, ...(cursor && { _id: { $lt: cursor } }) };
  const rows = await CreditLedger.find(filter)
    .sort({ _id: -1 })
    .limit(HISTORY_PAGE + 1)
    .populate('userId', 'name')
    .populate('fileId', 'displayName')
    .lean();
  const hasMore = rows.length > HISTORY_PAGE;
  const page = hasMore ? rows.slice(0, HISTORY_PAGE) : rows;
  return {
    entries: page.map((row) => ({
      id: String(row._id),
      kind: row.kind,
      credits: row.credits,
      balanceAfter: row.balanceAfter,
      user: row.userId?.name ?? null,
      fileName: row.fileId?.displayName ?? null,
      note: row.note,
      at: row.createdAt,
    })),
    nextCursor: hasMore ? String(page.at(-1)._id) : null,
  };
}
