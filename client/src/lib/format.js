const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const digits = value >= 10 || exponent === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`;
}

const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

export function formatShortDate(value) {
  return shortDate.format(new Date(value));
}

export function daysUntil(value) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / msPerDay));
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatInr(amount) {
  return inr.format(amount);
}

const inrWithPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Keeps the paise (₹470.82) where a figure has them, e.g. amounts with GST.
export function formatInrExact(amount) {
  return Math.round(amount * 100) % 100 === 0 ? inr.format(amount) : inrWithPaise.format(amount);
}

// "film, retainer" -> ["film", "retainer"]
export function parseTagList(text) {
  return (text ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}
