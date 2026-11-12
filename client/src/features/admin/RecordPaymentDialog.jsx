import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { toDateInputValue } from '../../lib/dates.js';
import { PAYMENT_METHODS, PLAN_OPTIONS } from './adminFormat.js';

const INTERVAL_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

// `fixedPlan`: plan and interval come from an upgrade request and can't be changed here.
function PaymentForm({ initial, fixedPlan, pending, error, onSubmit, onCancel }) {
  const [values, setValues] = useState({
    planCode: initial.planCode ?? 'studio',
    interval: initial.interval ?? 'monthly',
    amount: String(initial.amount ?? ''),
    method: 'upi',
    reference: '',
    paidOn: toDateInputValue(new Date()),
  });
  const set = (field) => (event) => setValues({ ...values, [field]: event.target.value });
  const amountIsValid = /^\d+$/.test(values.amount);

  function submit(event) {
    event.preventDefault();
    onSubmit({
      planCode: values.planCode,
      interval: values.interval,
      amount: Number(values.amount),
      method: values.method,
      reference: values.reference.trim() || undefined,
      paidAt: new Date(`${values.paidOn}T12:00:00`).toISOString(),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="pay-plan"
          label="Plan"
          options={PLAN_OPTIONS}
          value={values.planCode}
          onChange={set('planCode')}
          disabled={fixedPlan}
        />
        <SelectField
          id="pay-interval"
          label="Billing"
          options={INTERVAL_OPTIONS}
          value={values.interval}
          onChange={set('interval')}
          disabled={fixedPlan}
        />
        <TextField
          id="pay-amount"
          label="Amount received (₹)"
          inputMode="numeric"
          value={values.amount}
          onChange={set('amount')}
          error={values.amount && !amountIsValid ? 'Whole rupees, no commas' : undefined}
        />
        <TextField
          id="pay-date"
          label="Paid on"
          type="date"
          value={values.paidOn}
          max={toDateInputValue(new Date())}
          onChange={set('paidOn')}
        />
        <SelectField
          id="pay-method"
          label="Method"
          options={PAYMENT_METHODS}
          value={values.method}
          onChange={set('method')}
        />
        <TextField
          id="pay-reference"
          label="Reference"
          placeholder="UPI / UTR / receipt no."
          value={values.reference}
          onChange={set('reference')}
        />
      </div>
      <p className="text-muted text-sm">
        Saving switches the workspace onto this plan and starts (or extends) its paid period.
      </p>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} disabled={!amountIsValid}>
          Record payment
        </Button>
      </DialogActions>
    </form>
  );
}

export function RecordPaymentDialog({
  open,
  title,
  initial = {},
  fixedPlan = false,
  pending,
  error,
  onSubmit,
  onClose,
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <PaymentForm
        initial={initial}
        fixedPlan={fixedPlan}
        pending={pending}
        error={error}
        onSubmit={onSubmit}
        onCancel={onClose}
      />
    </Dialog>
  );
}
