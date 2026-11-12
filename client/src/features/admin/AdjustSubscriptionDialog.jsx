import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { PLAN_OPTIONS } from './adminFormat.js';
import { useAdjustSubscription } from './hooks.js';

const STATUS_CHOICES = [
  { value: 'past_due', label: 'Payment due (grace period, uploads still work)' },
  { value: 'read_only', label: 'Read-only (uploads blocked, nothing deleted)' },
  { value: 'canceled', label: 'Cancelled (counts toward churn)' },
  { value: 'active', label: 'Active' },
];

function AdjustForm({ subscription, onDone }) {
  const adjust = useAdjustSubscription();
  const isTrial = subscription.billing.status === 'trialing';
  const actions = [
    ...(isTrial ? [{ value: 'extend_trial', label: 'Extend trial' }] : []),
    { value: 'set_status', label: 'Change status' },
    { value: 'change_plan', label: 'Change plan' },
  ];
  const [action, setAction] = useState(actions[0].value);
  const [days, setDays] = useState('7');
  const [status, setStatus] = useState('past_due');
  const [planCode, setPlanCode] = useState(subscription.billing.planCode ?? 'studio');

  function submit(event) {
    event.preventDefault();
    const change =
      action === 'extend_trial'
        ? { action, days: Number(days) }
        : action === 'set_status'
          ? { action, status }
          : { action, planCode };
    adjust.mutate({ workspaceId: subscription.workspaceId, ...change }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {adjust.error && <Alert tone="error">{adjust.error.message}</Alert>}
      <SegmentedControl label="Adjustment" options={actions} value={action} onChange={setAction} />
      {action === 'extend_trial' && (
        <TextField
          id="adjust-days"
          label="Extra days"
          type="number"
          min="1"
          max="90"
          value={days}
          onChange={(event) => setDays(event.target.value)}
        />
      )}
      {action === 'set_status' && (
        <SelectField
          id="adjust-status"
          label="New status"
          options={STATUS_CHOICES}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        />
      )}
      {action === 'change_plan' && (
        <SelectField
          id="adjust-plan"
          label="Plan"
          hint="Changes storage and limits now. Record a payment separately if money changed hands."
          options={PLAN_OPTIONS}
          value={planCode}
          onChange={(event) => setPlanCode(event.target.value)}
        />
      )}
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={adjust.isPending}>
          Apply
        </Button>
      </DialogActions>
    </form>
  );
}

export function AdjustSubscriptionDialog({ subscription, onClose }) {
  return (
    <Dialog
      open={Boolean(subscription)}
      onClose={onClose}
      title={subscription ? `Adjust ${subscription.workspaceName}` : 'Adjust'}
    >
      {subscription && <AdjustForm subscription={subscription} onDone={onClose} />}
    </Dialog>
  );
}
