import { BILLING, FREE_PLAN } from '../../config/constants.js';
import { freeStorageBytes } from '../plans/plans.service.js';
import { logger } from '../../utils/logger.js';
import { deliverEmailInBackground } from '../../utils/mailer.js';
import { User } from '../users/user.model.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { planExpiredEmail, renewalReminderEmail } from './billing.emails.js';

// Plans are paid in advance and do not renew by themselves, so a paid period
// simply runs out:
//   active    -> past_due   when currentPeriodEnd passes (uploads keep working)
//   past_due  -> read_only  after BILLING.GRACE_DAYS more (uploads stop)
// The grace period counts from when the sweeper first notices the lapse, so a
// plan that ran out before this existed still gets its full grace period.
// effectiveBilling() applies this the moment a request reads a workspace; the
// sweeper writes it to the database (for admin lists and MRR) and sends the
// reminder and expiry emails.

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;
const FIRST_SWEEP_AFTER_MS = 30 * 1000;
const BATCH = 200;

function graceEndsAt(billing, noticedAt = billing.pastDueSince) {
  const start = Math.max(
    new Date(billing.currentPeriodEnd).getTime(),
    noticedAt ? new Date(noticedAt).getTime() : 0,
  );
  return new Date(start + BILLING.GRACE_DAYS * DAY_MS);
}

export function effectiveStatus(billing, now = new Date()) {
  const { status, currentPeriodEnd } = billing;
  // There are no trials any more: one from before is the free plan straight
  // away (the sweeper writes it down, with the free plan's space).
  if (status === 'trialing') return 'free';
  if (!currentPeriodEnd || !['active', 'past_due'].includes(status)) return status;
  if (currentPeriodEnd > now) return status;
  // Still "active" in the database: the sweeper is about to start its grace period.
  if (status === 'active') return 'past_due';
  return graceEndsAt(billing) > now ? 'past_due' : 'read_only';
}

// The billing snapshot as it stands right now, whatever the sweeper last wrote.
export function effectiveBilling(billing, now = new Date()) {
  const status = effectiveStatus(billing, now);
  return {
    ...billing,
    // An old trial reads as the free plan straight away.
    ...(status === 'free' && { planCode: FREE_PLAN.PLAN_CODE, trialEndsAt: null }),
    status,
    graceEndsAt:
      status === 'past_due' && billing.currentPeriodEnd && billing.currentPeriodEnd <= now
        ? graceEndsAt(billing, billing.pastDueSince ?? now)
        : null,
  };
}

async function ownersOf(workspaces) {
  const owners = await User.find({ _id: { $in: workspaces.map((ws) => ws.ownerId) } })
    .select('name email status')
    .lean();
  return new Map(owners.map((owner) => [String(owner._id), owner]));
}

function emailOwners(workspaces, owners, buildEmail) {
  for (const workspace of workspaces) {
    const owner = owners.get(String(workspace.ownerId));
    if (owner?.status === 'active') deliverEmailInBackground(buildEmail(workspace, owner));
  }
}

// Each step claims its workspaces with a conditional update, so two server
// processes sweeping at once never email the same owner twice.
async function claim(candidates, filter, update) {
  const claimed = [];
  for (const workspace of candidates) {
    const result = await Workspace.updateOne(
      { _id: workspace._id, ...filter(workspace) },
      update(workspace),
    );
    if (result.modifiedCount === 1) claimed.push(workspace);
  }
  return claimed;
}

async function remindBeforeExpiry(now) {
  const soon = new Date(now.getTime() + BILLING.REMIND_DAYS_BEFORE * DAY_MS);
  const candidates = await Workspace.find({
    'billing.status': 'active',
    'billing.currentPeriodEnd': { $gt: now, $lte: soon },
    $expr: { $ne: ['$billing.renewalRemindedFor', '$billing.currentPeriodEnd'] },
  })
    .limit(BATCH)
    .lean();
  const claimed = await claim(
    candidates,
    (ws) => ({
      'billing.currentPeriodEnd': ws.billing.currentPeriodEnd,
      'billing.renewalRemindedFor': { $ne: ws.billing.currentPeriodEnd },
    }),
    (ws) => ({ $set: { 'billing.renewalRemindedFor': ws.billing.currentPeriodEnd } }),
  );
  emailOwners(claimed, await ownersOf(claimed), (workspace, owner) =>
    renewalReminderEmail({ workspace, owner }),
  );
  return claimed.length;
}

async function expirePlans(now) {
  const candidates = await Workspace.find({
    'billing.status': 'active',
    'billing.currentPeriodEnd': { $lte: now },
  })
    .limit(BATCH)
    .lean();
  const claimed = await claim(
    candidates,
    (ws) => ({
      'billing.status': 'active',
      'billing.currentPeriodEnd': ws.billing.currentPeriodEnd,
    }),
    () => ({ $set: { 'billing.status': 'past_due', 'billing.pastDueSince': now } }),
  );
  emailOwners(claimed, await ownersOf(claimed), (workspace, owner) =>
    planExpiredEmail({ workspace, owner, graceEndsAt: graceEndsAt(workspace.billing, now) }),
  );
  return claimed.length;
}

async function endGracePeriods(now) {
  const cutoff = new Date(now.getTime() - BILLING.GRACE_DAYS * DAY_MS);
  const lapsed = await Workspace.find({
    'billing.status': 'past_due',
    'billing.currentPeriodEnd': { $lte: cutoff },
  })
    .limit(BATCH)
    .lean();
  const candidates = lapsed.filter((workspace) => graceEndsAt(workspace.billing) <= now);
  const toFree = await freeState();
  const claimed = await claim(
    candidates,
    (ws) => ({
      'billing.status': 'past_due',
      'billing.currentPeriodEnd': ws.billing.currentPeriodEnd,
    }),
    () => ({ $set: toFree }),
  );
  return claimed.length;
}

// What an account on the free plan looks like, with the free plan's space as
// the admin set it. Files over the free space stay and can be opened; uploads
// wait until there is room again.
export async function freeState() {
  return {
    'billing.planCode': FREE_PLAN.PLAN_CODE,
    'billing.status': 'free',
    'billing.trialEndsAt': null,
    'billing.interval': null,
    'billing.amount': null,
    'billing.currentPeriodEnd': null,
    'billing.pastDueSince': null,
    'storage.planLimitBytes': await freeStorageBytes(),
  };
}

// Old trials, read-only and plan-less accounts (from before the free plan
// existed) move to the free plan. Workspaces sharing an owner's account have
// no plan of their own and are left alone.
async function moveToFreePlan() {
  const result = await Workspace.updateMany(
    {
      storagePoolId: null,
      $or: [{ 'billing.status': { $in: ['trialing', 'none', 'read_only', 'canceled'] } }],
    },
    { $set: await freeState() },
  );
  return result.modifiedCount;
}

export async function sweepPlans(now = new Date()) {
  const reminded = await remindBeforeExpiry(now);
  const expired = await expirePlans(now);
  const movedToFree = (await endGracePeriods(now)) + (await moveToFreePlan());
  if (reminded || expired || movedToFree) {
    logger.info({ reminded, expired, movedToFree }, 'Plan lifecycle sweep');
  }
}

let timer = null;
let firstRun = null;

export function startPlanLifecycle() {
  const run = () =>
    sweepPlans().catch((err) => logger.warn({ err }, 'Plan lifecycle sweep failed'));
  firstRun = setTimeout(run, FIRST_SWEEP_AFTER_MS);
  firstRun.unref();
  timer = setInterval(run, SWEEP_EVERY_MS);
  timer.unref();
}

export function stopPlanLifecycle() {
  clearTimeout(firstRun);
  clearInterval(timer);
  timer = null;
}
