import { format } from 'date-fns';

export const PLAN_NAMES = { starter: 'Starter', studio: 'Studio', agency: 'Agency' };

export const PLAN_OPTIONS = Object.entries(PLAN_NAMES).map(([value, label]) => ({ value, label }));

export const BILLING_STATUS = {
  trialing: { label: 'Trial', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  past_due: { label: 'Ended, in grace', tone: 'accent' },
  read_only: { label: 'Read-only', tone: 'danger' },
  canceled: { label: 'Cancelled', tone: 'muted' },
  none: { label: 'No plan', tone: 'muted' },
};

export const BILLING_STATUS_OPTIONS = Object.entries(BILLING_STATUS).map(([value, { label }]) => ({
  value,
  label,
}));

export const PAYMENT_METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer (NEFT/IMPS)' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'razorpay', label: 'Razorpay link' },
  { value: 'other', label: 'Other' },
];

export function methodLabel(value) {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value;
}

const RAZORPAY_METHODS = {
  upi: 'UPI',
  card: 'card',
  netbanking: 'netbanking',
  wallet: 'wallet',
  emi: 'EMI',
  paylater: 'pay later',
};

// "Razorpay (UPI)" for online payments, the plain method otherwise.
export function paymentMethodLabel(payment) {
  const via = RAZORPAY_METHODS[payment.razorpayMethod] ?? payment.razorpayMethod;
  return payment.method === 'razorpay' && via ? `Razorpay (${via})` : methodLabel(payment.method);
}

export function shortDate(value) {
  return value ? format(new Date(value), 'd MMM yyyy') : '—';
}

export function dateTime(value) {
  return value ? format(new Date(value), 'd MMM yyyy, h:mm a') : '—';
}

export function percent(ratio) {
  return `${(ratio * 100).toFixed(ratio > 0 && ratio < 0.1 ? 1 : 0)}%`;
}

// Compact rupees for chart axes: ₹950, ₹12K, ₹1.2L (lakh).
export function compactInr(amount) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(amount >= 1000000 ? 0 : 1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}K`;
  return `₹${amount}`;
}
