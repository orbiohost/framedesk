import { Payment } from '../billing/payment.model.js';

const PAGE_SIZE = 50;
const ALL_WORKSPACES = { crossWorkspace: true };

function paymentFilter({ from, to, method }) {
  const filter = {};
  if (from || to) filter.paidAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (method) filter.method = method;
  return filter;
}

function toPaymentDto(payment) {
  return {
    id: String(payment._id),
    workspace: payment.workspaceId
      ? { id: String(payment.workspaceId._id), name: payment.workspaceId.name }
      : null,
    amount: payment.amount,
    taxableAmount: payment.taxableAmount ?? null,
    tax: payment.tax ?? null,
    customerGstin: payment.billedTo?.gstin ?? null,
    planCode: payment.planCode,
    interval: payment.interval,
    method: payment.method,
    reference: payment.reference,
    offerCode: payment.offerCode,
    source: payment.source,
    paidAt: payment.paidAt,
    periodEnd: payment.periodEnd,
    recordedBy: payment.recordedBy?.name ?? null,
  };
}

function findPayments(query) {
  return Payment.find(query)
    .setOptions(ALL_WORKSPACES)
    .sort({ paidAt: -1, _id: -1 })
    .populate('workspaceId', 'name')
    .populate('recordedBy', 'name');
}

export async function listPayments({ cursor, ...filters }) {
  const query = paymentFilter(filters);
  if (cursor) query._id = { $lt: cursor };

  const [payments, [totals]] = await Promise.all([
    findPayments(query)
      .limit(PAGE_SIZE + 1)
      .lean(),
    Payment.aggregate([
      { $match: paymentFilter(filters) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]).option(ALL_WORKSPACES),
  ]);

  const hasMore = payments.length > PAGE_SIZE;
  const page = hasMore ? payments.slice(0, PAGE_SIZE) : payments;
  return {
    payments: page.map(toPaymentDto),
    totals: { amount: totals?.amount ?? 0, count: totals?.count ?? 0 },
    nextCursor: hasMore ? String(page.at(-1)._id) : null,
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  // Quote everything, and defuse cells a spreadsheet would run as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

const CSV_COLUMNS = [
  ['Paid at', (p) => p.paidAt.toISOString()],
  ['Workspace', (p) => p.workspace?.name],
  ['Plan', (p) => p.planCode],
  ['Billing', (p) => p.interval],
  ['Amount (INR)', (p) => p.amount],
  ['Taxable value (INR)', (p) => p.taxableAmount],
  ['CGST (INR)', (p) => p.tax?.cgst],
  ['SGST (INR)', (p) => p.tax?.sgst],
  ['IGST (INR)', (p) => p.tax?.igst],
  ['Place of supply', (p) => p.tax?.placeOfSupply?.name],
  ['Customer GSTIN', (p) => p.customerGstin],
  ['Method', (p) => p.method],
  ['Reference', (p) => p.reference],
  ['Offer', (p) => p.offerCode],
  ['Paid until', (p) => p.periodEnd.toISOString()],
  ['Recorded by', (p) => p.recordedBy],
];

export async function paymentsCsv(filters) {
  const payments = (await findPayments(paymentFilter(filters)).limit(50000).lean()).map(
    toPaymentDto,
  );
  const header = CSV_COLUMNS.map(([title]) => csvCell(title)).join(',');
  const rows = payments.map((payment) =>
    CSV_COLUMNS.map(([, read]) => csvCell(read(payment))).join(','),
  );
  return [header, ...rows].join('\r\n');
}
