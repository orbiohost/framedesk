import { APP_NAME } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { cached } from '../../utils/cache.js';
import { BillingSettings, Counter, SETTINGS_SCOPE } from './billingSettings.model.js';
import { stateCodeFromGstin } from './gst.js';

export const EDITABLE_FIELDS = [
  'businessName',
  'addressLine',
  'city',
  'state',
  'postalCode',
  'country',
  'email',
  'phone',
  'gstEnabled',
  'gstin',
  'gstRate',
  'sacCode',
  'invoicePrefix',
  'footerNote',
];

// What the settings are before an admin saves them: the env vars.
function envDefaults() {
  const addressLines = (env.INVOICE_BUSINESS_ADDRESS ?? '')
    .split('|')
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    businessName: env.INVOICE_BUSINESS_NAME ?? APP_NAME,
    addressLine: addressLines.join(', ') || null,
    city: null,
    state: null,
    postalCode: null,
    country: 'India',
    email: env.INVOICE_BUSINESS_EMAIL ?? null,
    phone: null,
    gstEnabled: Boolean(env.INVOICE_BUSINESS_GSTIN),
    gstin: env.INVOICE_BUSINESS_GSTIN ?? null,
    gstRate: env.GST_RATE,
    sacCode: env.GST_SAC_CODE ?? null,
    invoicePrefix: 'FD',
    footerNote: null,
  };
}

function toSettings(doc) {
  const defaults = envDefaults();
  if (!doc) return { ...defaults, source: 'environment', updatedAt: null };
  return {
    ...Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, doc[field] ?? defaults[field]])),
    source: 'database',
    updatedAt: doc.updatedAt,
  };
}

export async function getBillingSettings() {
  const doc = await cached('billing-settings', [SETTINGS_SCOPE], () =>
    BillingSettings.findOne({ key: 'default' }).lean(),
  );
  return toSettings(doc);
}

export async function updateBillingSettings(input, adminId) {
  const current = await getBillingSettings();
  const next = { ...current, ...input };
  const doc = await BillingSettings.findOneAndUpdate(
    { key: 'default' },
    {
      $set: {
        ...Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, next[field]])),
        updatedBy: adminId,
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  return toSettings(doc);
}

// The seller block printed on an invoice.
export function sellerFrom(settings) {
  const cityLine = [settings.city, settings.postalCode].filter(Boolean).join(' ');
  return {
    name: settings.businessName,
    addressLines: [settings.addressLine, cityLine, settings.state, settings.country].filter(
      Boolean,
    ),
    email: settings.email,
    phone: settings.phone,
    gstin: settings.gstEnabled ? settings.gstin : null,
    footerNote: settings.footerNote,
  };
}

// The GST rules computeGst works from.
export function gstFrom(settings) {
  const sellerGstin = settings.gstEnabled ? settings.gstin : null;
  return {
    // A business can only charge GST once it is registered (has a GSTIN).
    applies: Boolean(sellerGstin) && settings.gstRate > 0,
    rate: settings.gstRate,
    sellerGstin,
    sellerStateCode: stateCodeFromGstin(sellerGstin),
    sacCode: settings.sacCode,
  };
}

export async function getSeller() {
  return sellerFrom(await getBillingSettings());
}

export async function getGstRules() {
  return gstFrom(await getBillingSettings());
}

// Indian financial year (April to March) of a date, in IST: 2026-11-12 -> 2026.
function financialYear(date) {
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  return ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
}

function formatInvoiceNumber(prefix, year, seq) {
  const label = `${String(year % 100).padStart(2, '0')}-${String((year + 1) % 100).padStart(2, '0')}`;
  return `${prefix}/${label}/${String(seq).padStart(4, '0')}`;
}

// GST invoices need a consecutive serial per financial year, at most 16
// characters: FD/26-27/0001. The counter is atomic, so numbers never repeat.
export async function nextInvoiceNumber(prefix, date = new Date()) {
  const year = financialYear(date);
  const counter = await Counter.findOneAndUpdate(
    { _id: `invoice:${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  ).lean();
  return formatInvoiceNumber(prefix, year, counter.seq);
}

// The number the next invoice would get, without using it up.
export async function previewInvoiceNumber(prefix, date = new Date()) {
  const year = financialYear(date);
  const counter = await Counter.findById(`invoice:${year}`).lean();
  return formatInvoiceNumber(prefix, year, (counter?.seq ?? 0) + 1);
}
