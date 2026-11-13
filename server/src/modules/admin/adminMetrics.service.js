import { Payment } from '../billing/payment.model.js';
import { UpgradeRequest } from '../billing/upgradeRequest.model.js';
import { countOpenTickets } from '../support/support.service.js';
import { User } from '../users/user.model.js';
import { Workspace, storageLimitBytes } from '../workspaces/workspace.model.js';
import { monthlyValue } from './adminSubscriptions.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = 'Asia/Kolkata';
const ALL_WORKSPACES = { crossWorkspace: true };

const daysAgo = (days, now) => new Date(now.getTime() - days * DAY_MS);

function startOfMonthIst(now, monthsBack = 0) {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const start = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - monthsBack, 1);
  return new Date(start - 5.5 * 60 * 60 * 1000);
}

async function userMetrics(now) {
  const [total, new7, new30, active7, active30, suspended] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: daysAgo(7, now) } }),
    User.countDocuments({ createdAt: { $gte: daysAgo(30, now) } }),
    User.countDocuments({ lastActiveAt: { $gte: daysAgo(7, now) } }),
    User.countDocuments({ lastActiveAt: { $gte: daysAgo(30, now) } }),
    User.countDocuments({ status: 'suspended' }),
  ]);
  return { total, new7, new30, active7, active30, suspended };
}

async function subscriptionMetrics(now) {
  const allWorkspaces = await Workspace.find().select('billing storage name storagePoolId').lean();
  // Subscriptions and storage live on account workspaces; ones that share an
  // owner's account have no plan or bytes of their own.
  const workspaces = allWorkspaces.filter((workspace) => !workspace.storagePoolId);
  const byStatus = {};
  let mrr = 0;
  for (const { billing } of workspaces) {
    byStatus[billing.status] = (byStatus[billing.status] ?? 0) + 1;
    mrr += monthlyValue(billing);
  }

  const trialsEndingSoon = workspaces.filter(
    ({ billing }) =>
      billing.status === 'trialing' &&
      billing.trialEndsAt > now &&
      billing.trialEndsAt < new Date(now.getTime() + 3 * DAY_MS),
  ).length;
  const canceled30 = workspaces.filter(
    ({ billing }) => billing.canceledAt && billing.canceledAt >= daysAgo(30, now),
  ).length;
  const paying = (byStatus.active ?? 0) + (byStatus.past_due ?? 0);
  const churnRate = paying + canceled30 > 0 ? canceled30 / (paying + canceled30) : 0;

  const topStorage = [...workspaces]
    .sort((a, b) => b.storage.usedBytes - a.storage.usedBytes)
    .slice(0, 8)
    .map((workspace) => ({
      id: String(workspace._id),
      name: workspace.name,
      usedBytes: workspace.storage.usedBytes,
      limitBytes: storageLimitBytes(workspace),
    }));

  return {
    totalWorkspaces: allWorkspaces.length,
    byStatus,
    paying,
    trialing: byStatus.trialing ?? 0,
    trialsEndingSoon,
    canceled30,
    churnRate,
    mrr: Math.round(mrr),
    arr: Math.round(mrr * 12),
    storageUsedBytes: workspaces.reduce(
      (total, workspace) => total + workspace.storage.usedBytes,
      0,
    ),
    topStorage,
  };
}

// Revenue excludes GST, which is collected for the government. Payments from
// before GST was tracked have no taxable amount and count in full.
const NET_OF_GST = { $ifNull: ['$taxableAmount', '$amount'] };

async function sumPayments(match) {
  const [row] = await Payment.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: NET_OF_GST } } },
  ]).option(ALL_WORKSPACES);
  return row?.total ?? 0;
}

async function revenueMetrics(now) {
  const [total, thisMonth, lastMonth] = await Promise.all([
    sumPayments({}),
    sumPayments({ paidAt: { $gte: startOfMonthIst(now) } }),
    sumPayments({ paidAt: { $gte: startOfMonthIst(now, 1), $lt: startOfMonthIst(now) } }),
  ]);
  const byMonth = await Payment.aggregate([
    { $match: { paidAt: { $gte: startOfMonthIst(now, 11) } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: TIME_ZONE } },
        amount: { $sum: NET_OF_GST },
      },
    },
  ]).option(ALL_WORKSPACES);
  return { total, thisMonth, lastMonth, byMonth: fillMonths(byMonth, now) };
}

// Every one of the last 12 months, including those with no sales.
function fillMonths(rows, now) {
  const amounts = new Map(rows.map((row) => [row._id, row.amount]));
  return Array.from({ length: 12 }, (_, index) => {
    const start = startOfMonthIst(now, 11 - index);
    const key = new Date(start.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 7);
    return { month: key, amount: amounts.get(key) ?? 0 };
  });
}

async function signupsByDay(now) {
  const rows = await User.aggregate([
    { $match: { createdAt: { $gte: daysAgo(30, now) } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TIME_ZONE } },
        count: { $sum: 1 },
      },
    },
  ]);
  const counts = new Map(rows.map((row) => [row._id, row.count]));
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(daysAgo(29 - index, now).getTime() + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return { day, count: counts.get(day) ?? 0 };
  });
}

export async function getDashboardMetrics(now = new Date()) {
  const [users, subscriptions, revenue, signups, openUpgradeRequests, openSupportTickets] =
    await Promise.all([
      userMetrics(now),
      subscriptionMetrics(now),
      revenueMetrics(now),
      signupsByDay(now),
      UpgradeRequest.countDocuments({ status: 'open' }).setOptions(ALL_WORKSPACES),
      countOpenTickets(),
    ]);
  // Files live in S3, which has no fixed size, so there is no server-disk card.
  return {
    users,
    subscriptions,
    revenue,
    signups,
    disk: null,
    openUpgradeRequests,
    openSupportTickets,
    generatedAt: now,
  };
}
