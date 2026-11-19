import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostForecastCommand,
} from '@aws-sdk/client-cost-explorer';
import {
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { storageConfig } from '../../config/storage.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { CreditLedger } from '../ai/creditLedger.model.js';
import { Payment } from '../billing/payment.model.js';
import { StoredFile } from '../files/file.model.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { CostSettings, Expense } from './adminCosts.model.js';
import { recordAudit } from './auditLog.service.js';

// Admin → Expenses: what running the app costs, live where it can be measured.
//
// - S3 storage: the bucket is listed (every object, plus unfinished multipart
//   uploads that S3 bills but nobody sees), so the size is the real one, not
//   only what the app counts against customers.
// - The AWS bill: month-to-date and forecast from Cost Explorer, when the IAM
//   key may read it (ce:GetCostAndUsage). Each call costs AWS $0.01, so it is
//   fetched on request and kept.
// - AI: tokens and images from the credit ledger, priced per million tokens.
// - Everything else (VPS, domain, email...) is entered by hand as expenses.

const ALL_WORKSPACES = { crossWorkspace: true };
const GB = 1024 ** 3;
const TIME_ZONE_OFFSET_MS = 5.5 * 60 * 60 * 1000;
// A listing older than this is redone when the page opens.
const SCAN_MAX_AGE_MS = 6 * 60 * 60 * 1000;
// 1,000 objects per request: up to a million objects per listing.
const MAX_LIST_PAGES = 1000;
const MAX_MULTIPART = 200;
const AI_KINDS = ['chat', 'analysis', 'brief', 'moodboard', 'social', 'memory', 'skill'];

let scanning = null;

function startOfMonthIst(now, monthsBack = 0) {
  const ist = new Date(now.getTime() + TIME_ZONE_OFFSET_MS);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - monthsBack, 1) - TIME_ZONE_OFFSET_MS,
  );
}

function monthProgress(now) {
  const start = startOfMonthIst(now);
  const end = startOfMonthIst(new Date(start.getTime() + 40 * 24 * 3600 * 1000));
  const total = end - start;
  return { start, end, elapsed: Math.min(1, Math.max(0.001, (now - start) / total)) };
}

function s3Client() {
  const config = storageConfig.s3;
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
  });
}

async function settingsDoc() {
  return CostSettings.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

// ---- S3 bucket ---------------------------------------------------------------

async function listBucket() {
  const client = s3Client();
  const { bucket, keyPrefix } = storageConfig.s3;
  let bytes = 0;
  let objects = 0;
  let token;
  let pages = 0;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: keyPrefix || undefined,
        ContinuationToken: token,
      }),
    );
    for (const object of page.Contents ?? []) {
      bytes += object.Size ?? 0;
      objects += 1;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    pages += 1;
  } while (token && pages < MAX_LIST_PAGES);

  // Parts of uploads that were never completed or cancelled.
  let incompleteUploads = 0;
  let incompleteBytes = 0;
  const uploads = await client.send(
    new ListMultipartUploadsCommand({ Bucket: bucket, Prefix: keyPrefix || undefined }),
  );
  for (const upload of (uploads.Uploads ?? []).slice(0, MAX_MULTIPART)) {
    incompleteUploads += 1;
    const parts = await client
      .send(new ListPartsCommand({ Bucket: bucket, Key: upload.Key, UploadId: upload.UploadId }))
      .catch(() => null);
    for (const part of parts?.Parts ?? []) incompleteBytes += part.Size ?? 0;
  }
  return { bytes, objects, incompleteUploads, incompleteBytes, truncated: Boolean(token) };
}

/** Lists the bucket again (one at a time) and keeps the result. */
export async function refreshBucketScan() {
  scanning ??= (async () => {
    let scan;
    try {
      scan = { ...(await listBucket()), error: null };
    } catch (err) {
      logger.warn({ err: err.message }, 'Could not list the S3 bucket for costs');
      scan = {
        error:
          err.name === 'AccessDenied'
            ? 'The S3 key may not list the bucket (s3:ListBucket).'
            : err.message,
      };
    }
    const set = Object.fromEntries(
      Object.entries({ ...scan, scannedAt: new Date() }).map(([key, value]) => [
        `bucketScan.${key}`,
        value,
      ]),
    );
    await CostSettings.updateOne({ key: 'global' }, { $set: set }, { upsert: true });
  })().finally(() => {
    scanning = null;
  });
  return scanning;
}

// ---- AWS bill (Cost Explorer) ---------------------------------------------

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/** Fetches the month-to-date AWS bill and forecast. Costs AWS $0.02 per refresh. */
export async function refreshAwsBill(adminId) {
  const config = storageConfig.s3;
  if (config.endpoint) {
    throw AppError.badRequest('Cost Explorer is only for Amazon S3, not other stores', 'NOT_AWS');
  }
  const client = new CostExplorerClient({
    region: 'us-east-1',
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
  });
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  // Cost Explorer's end date is exclusive; on the 1st, the month so far is empty.
  const end = new Date(
    Math.max(
      start.getTime() + 24 * 3600 * 1000,
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    ),
  );
  let bill;
  try {
    const usage = await client.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: isoDay(start), End: isoDay(end) },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      }),
    );
    const groups = usage.ResultsByTime?.[0]?.Groups ?? [];
    const services = groups
      .map((group) => ({
        name: group.Keys?.[0] ?? 'Other',
        amount: Number(group.Metrics?.UnblendedCost?.Amount ?? 0),
      }))
      .filter((service) => service.amount >= 0.005)
      .sort((a, b) => b.amount - a.amount);
    let forecastUsd = null;
    const tomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    if (tomorrow < nextMonth) {
      const forecast = await client
        .send(
          new GetCostForecastCommand({
            TimePeriod: { Start: isoDay(tomorrow), End: isoDay(nextMonth) },
            Metric: 'UNBLENDED_COST',
            Granularity: 'MONTHLY',
          }),
        )
        .catch(() => null);
      if (forecast?.Total?.Amount) {
        forecastUsd =
          services.reduce((sum, service) => sum + service.amount, 0) +
          Number(forecast.Total.Amount);
      }
    }
    bill = {
      month: isoDay(start).slice(0, 7),
      totalUsd: services.reduce((sum, service) => sum + service.amount, 0),
      forecastUsd,
      services,
      error: null,
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not read the AWS bill');
    bill = {
      error:
        err.name === 'AccessDeniedException' || /not authorized/i.test(err.message)
          ? 'The AWS key may not read the bill. Add the IAM permissions ce:GetCostAndUsage and ce:GetCostForecast to it.'
          : err.message,
    };
  }
  const set = Object.fromEntries(
    Object.entries({ ...bill, fetchedAt: new Date() }).map(([key, value]) => [
      `awsBill.${key}`,
      value,
    ]),
  );
  await CostSettings.updateOne({ key: 'global' }, { $set: set }, { upsert: true });
  recordAudit({ actorId: adminId, action: 'costs.aws_bill_refreshed' });
}

// ---- Usage ------------------------------------------------------------------

async function appStorage() {
  const [accounts, trash] = await Promise.all([
    Workspace.aggregate([
      { $match: { storagePoolId: null } },
      { $group: { _id: null, bytes: { $sum: '$storage.usedBytes' } } },
    ]),
    // Trashed files no longer count for customers but stay in S3 until emptied.
    StoredFile.aggregate([
      { $match: { deletedAt: { $ne: null } } },
      { $group: { _id: null, bytes: { $sum: '$size' }, count: { $sum: 1 } } },
    ]).option(ALL_WORKSPACES),
  ]);
  return {
    countedBytes: accounts[0]?.bytes ?? 0,
    trashBytes: trash[0]?.bytes ?? 0,
    trashFiles: trash[0]?.count ?? 0,
  };
}

async function aiUsage(since) {
  const rows = await CreditLedger.aggregate([
    { $match: { createdAt: { $gte: since }, credits: { $lt: 0 } } },
    { $group: { _id: '$kind', tokens: { $sum: { $ifNull: ['$tokens', 0] } }, uses: { $sum: 1 } } },
  ]).option(ALL_WORKSPACES);
  const byKind = Object.fromEntries(rows.map((row) => [row._id, row]));
  return {
    tokens: AI_KINDS.reduce((sum, kind) => sum + (byKind[kind]?.tokens ?? 0), 0),
    requests: AI_KINDS.reduce((sum, kind) => sum + (byKind[kind]?.uses ?? 0), 0),
    images: byKind.image?.uses ?? 0,
    byKind: AI_KINDS.map((kind) => ({
      kind,
      tokens: byKind[kind]?.tokens ?? 0,
      uses: byKind[kind]?.uses ?? 0,
    })).filter((row) => row.uses > 0),
  };
}

async function revenueThisMonth(since) {
  const [row] = await Payment.aggregate([
    { $match: { paidAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$taxableAmount', '$amount'] } } } },
  ]).option(ALL_WORKSPACES);
  return row?.total ?? 0;
}

// What an expense costs per month, in rupees (one-off: only in its month).
function monthlyInr(expense, settings, { start, end }) {
  const rate = expense.currency === 'USD' ? settings.usdToInr : 1;
  const began = new Date(expense.startedAt);
  if (began >= end) return 0;
  if (expense.endedAt && new Date(expense.endedAt) < start) return 0;
  if (expense.cycle === 'one_time') return began >= start ? expense.amount * rate : 0;
  const monthly = expense.cycle === 'yearly' ? expense.amount / 12 : expense.amount;
  return monthly * rate;
}

function toExpenseDto(expense, settings, month) {
  return {
    id: String(expense._id),
    name: expense.name,
    vendor: expense.vendor,
    category: expense.category,
    amount: expense.amount,
    currency: expense.currency,
    cycle: expense.cycle,
    startedAt: expense.startedAt,
    endedAt: expense.endedAt,
    renewsAt: expense.renewsAt,
    note: expense.note,
    active: !expense.endedAt || new Date(expense.endedAt) >= month.start,
    monthlyInr: Math.round(monthlyInr(expense, settings, month) * 100) / 100,
  };
}

export async function getCosts(now = new Date()) {
  let settings = await settingsDoc();
  const scanAge = settings.bucketScan?.scannedAt
    ? now - new Date(settings.bucketScan.scannedAt)
    : Infinity;
  if (scanAge > SCAN_MAX_AGE_MS) {
    // First time: wait for it. Later: refresh in the background, show the last one.
    const scan = refreshBucketScan();
    if (scanAge === Infinity) {
      await scan;
      settings = await settingsDoc();
    } else {
      scan.catch(() => {});
    }
  }

  const month = monthProgress(now);
  const [storage, ai, revenue, expenses] = await Promise.all([
    appStorage(),
    aiUsage(month.start),
    revenueThisMonth(month.start),
    Expense.find().sort({ endedAt: 1, createdAt: -1 }).lean(),
  ]);

  const rate = settings.usdToInr;
  const scan = settings.bucketScan ?? {};
  const bucketBytes = scan.scannedAt && !scan.error ? scan.bytes + scan.incompleteBytes : null;
  const billedBytes = bucketBytes ?? storage.countedBytes + storage.trashBytes;
  const s3MonthlyUsd = (billedBytes / GB) * settings.s3PricePerGbMonthUsd;

  const aiPricedUsd = (ai.tokens / 1e6) * settings.aiPricePerMillionTokensUsd;
  const aiUsd = settings.aiFreeTier ? 0 : aiPricedUsd;
  const imagesUsd = ai.images * settings.imagePriceUsd;
  const aiProjectedUsd = (aiUsd + imagesUsd) / month.elapsed;

  const bill = settings.awsBill ?? {};
  const billThisMonth = bill.fetchedAt && !bill.error && bill.month === isoDay(now).slice(0, 7);
  // The real AWS bill (projected to month end) replaces the S3 estimate when known.
  const awsProjectedUsd = billThisMonth
    ? (bill.forecastUsd ?? bill.totalUsd / month.elapsed)
    : null;

  const expenseRows = expenses.map((expense) => toExpenseDto(expense, settings, month));
  const fixedInr = expenseRows.reduce((sum, row) => sum + row.monthlyInr, 0);
  const usageInr = ((awsProjectedUsd ?? s3MonthlyUsd) + aiProjectedUsd) * rate;
  const totalInr = fixedInr + usageInr;

  return {
    generatedAt: now,
    month: { start: month.start, end: month.end, elapsed: month.elapsed },
    settings: {
      usdToInr: settings.usdToInr,
      s3PricePerGbMonthUsd: settings.s3PricePerGbMonthUsd,
      aiPricePerMillionTokensUsd: settings.aiPricePerMillionTokensUsd,
      aiFreeTier: settings.aiFreeTier,
      imagePriceUsd: settings.imagePriceUsd,
    },
    storage: {
      bucket: storageConfig.s3.bucket,
      region: storageConfig.s3.region,
      scannedAt: scan.scannedAt ?? null,
      scanError: scan.error ?? null,
      scanning: Boolean(scanning),
      bucketBytes: scan.scannedAt && !scan.error ? scan.bytes : null,
      objects: scan.objects ?? 0,
      truncated: Boolean(scan.truncated),
      incompleteUploads: scan.incompleteUploads ?? 0,
      incompleteBytes: scan.incompleteBytes ?? 0,
      countedBytes: storage.countedBytes,
      trashBytes: storage.trashBytes,
      trashFiles: storage.trashFiles,
      // Bucket minus what is counted for customers and in Trash: orphaned objects.
      untrackedBytes:
        bucketBytes === null
          ? null
          : Math.max(0, scan.bytes - storage.countedBytes - storage.trashBytes),
      monthlyUsd: s3MonthlyUsd,
      monthlyInr: s3MonthlyUsd * rate,
    },
    aws: {
      fetchedAt: bill.fetchedAt ?? null,
      error: bill.error ?? null,
      month: bill.month ?? null,
      current: Boolean(billThisMonth),
      totalUsd: bill.totalUsd ?? 0,
      forecastUsd: bill.forecastUsd ?? null,
      services: bill.services ?? [],
    },
    ai: {
      ...ai,
      pricedUsd: aiPricedUsd,
      imagesUsd,
      chargedUsd: aiUsd + imagesUsd,
      projectedUsd: aiProjectedUsd,
      freeTier: settings.aiFreeTier,
    },
    expenses: expenseRows,
    totals: {
      fixedInr,
      usageInr,
      totalInr,
      revenueInr: revenue,
      profitInr: revenue - totalInr,
      // Revenue so far against a full month of cost; projected revenue too.
      projectedRevenueInr: revenue / month.elapsed,
    },
  };
}

// ---- Settings and expenses --------------------------------------------------

export async function updateCostSettings(adminId, input) {
  await CostSettings.updateOne({ key: 'global' }, { $set: input }, { upsert: true });
  recordAudit({ actorId: adminId, action: 'costs.settings_updated', details: input });
}

export async function createExpense(adminId, input) {
  const expense = await Expense.create({ ...input, createdBy: adminId });
  recordAudit({ actorId: adminId, action: 'costs.expense_added', details: { name: input.name } });
  return expense;
}

export async function updateExpense(adminId, expenseId, input) {
  const expense = await Expense.findByIdAndUpdate(
    expenseId,
    { $set: input },
    { new: true, runValidators: true },
  );
  if (!expense) throw AppError.notFound('Expense not found');
  recordAudit({
    actorId: adminId,
    action: 'costs.expense_updated',
    details: { name: expense.name },
  });
  return expense;
}

export async function deleteExpense(adminId, expenseId) {
  const expense = await Expense.findByIdAndDelete(expenseId);
  if (!expense) throw AppError.notFound('Expense not found');
  recordAudit({
    actorId: adminId,
    action: 'costs.expense_deleted',
    details: { name: expense.name },
  });
}
