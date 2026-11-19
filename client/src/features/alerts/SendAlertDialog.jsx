import { BellRing, Check, CircleSlash, Loader2, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { cn } from '../../lib/cn.js';
import { useCurrentUser } from '../auth/hooks.js';
import { useMembers } from '../members/hooks.js';
import { canAdminister } from '../workspaces/roles.js';
import { useProjectAlerts, useSendAlert } from './hooks.js';
import { RING_FIELDS, RingValuePicker, describeRing } from './RingValuePicker.jsx';

const PRESETS = [
  'Please check this project now',
  'Urgent: client feedback is in',
  'Files are ready for review',
  'Call me about this project',
];

const STATUS = {
  ringing: {
    label: 'Ringing',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200',
  },
  opened: { label: 'Opened', className: 'bg-success/10 text-success', icon: Check },
  dismissed: { label: 'Dismissed', className: 'bg-subtle text-muted', icon: X },
  expired: { label: 'Missed', className: 'bg-subtle text-muted' },
  blocked: { label: 'Alerts off', className: 'bg-subtle text-muted', icon: CircleSlash },
};

function RecipientStatus({ recipient }) {
  const status = STATUS[recipient.status] ?? STATUS.ringing;
  const Icon = status.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        status.className,
      )}
      title={
        recipient.status === 'ringing' && recipient.delivered === 0
          ? 'No phone or computer with notifications on: they only see it when FrameDesk is open'
          : undefined
      }
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {status.label}
      {recipient.status === 'ringing' && recipient.sends > 1 && ` · ${recipient.sends}×`}
      {recipient.status === 'ringing' && recipient.delivered === 0 && (
        <Smartphone className="h-3 w-3 opacity-50" aria-label="no device" />
      )}
    </span>
  );
}

function timeOf(date) {
  return new Date(date).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// "Alert": rings the chosen teammates' phones and computers about this
// project, repeating until they open it (as each person's settings say).
export function SendAlertDialog({ workspace, project, open, onClose }) {
  const { data: me } = useCurrentUser();
  const members = useMembers(workspace.id);
  const recent = useProjectAlerts(workspace.id, project.id, { enabled: open });
  const send = useSendAlert(workspace.id, project.id);
  const others = (members.data ?? []).filter((member) => member.userId !== me?.id);
  // null: everyone.
  const [picked, setPicked] = useState(null);
  const [message, setMessage] = useState('');
  // null: each person's own settings; otherwise this alert's ring times.
  const [ring, setRing] = useState(null);
  const chosen = picked ?? new Set(others.map((member) => member.userId));

  function toggle(id) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  function submit(event) {
    event.preventDefault();
    send.mutate(
      {
        message: message.trim() || undefined,
        ...(picked && { userIds: [...picked] }),
        ...(ring && { ring }),
      },
      { onSuccess: () => setMessage('') },
    );
  }

  const allPicked = chosen.size === others.length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Alert teammates"
      description="Their phone or computer rings and shows a pop-up that opens this project. It repeats until they open it."
    >
      <form onSubmit={submit} className="space-y-4">
        {send.error && <Alert tone="error">{send.error.message}</Alert>}
        {send.isSuccess && !send.isPending && (
          <Alert tone="success">
            Alert sent to{' '}
            {send.data.recipients.filter((recipient) => recipient.status === 'ringing').length}{' '}
            {send.data.recipients.length === 1 ? 'person' : 'people'}.
          </Alert>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Who</p>
            {others.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setPicked(allPicked ? new Set() : new Set(others.map((member) => member.userId)))
                }
                className="text-accent text-xs font-medium hover:underline"
              >
                {allPicked ? 'Clear' : 'Everyone'}
              </button>
            )}
          </div>
          <div className="border-line/60 max-h-52 overflow-y-auto rounded-xl border">
            {members.isPending ? (
              <Loader2
                className="text-muted mx-auto my-5 h-5 w-5 animate-spin"
                aria-hidden="true"
              />
            ) : others.length === 0 ? (
              <p className="text-muted p-3 text-sm">
                Nobody else is in this workspace yet.{' '}
                {canAdminister(workspace) ? (
                  <Link
                    to={`/w/${workspace.id}/settings#members`}
                    onClick={onClose}
                    className="text-ink underline"
                  >
                    Invite people
                  </Link>
                ) : (
                  'Ask an owner or admin to invite people.'
                )}
              </p>
            ) : (
              others.map((member) => (
                <label
                  key={member.userId}
                  className="hover:bg-subtle flex cursor-pointer items-center gap-3 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={chosen.has(member.userId)}
                    onChange={() => toggle(member.userId)}
                    className="accent-accent h-4 w-4"
                  />
                  <Avatar name={member.name} src={member.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{member.name}</span>
                  <span className="text-muted text-xs capitalize">{member.role}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <TextField
            id="alert-message"
            label="Message (optional)"
            value={message}
            maxLength={300}
            placeholder="What do you need?"
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setMessage(preset)}
                className="border-line/70 hover:bg-subtle rounded-full border px-2.5 py-1 text-xs"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">How it rings</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { custom: false, label: 'Each person’s own settings' },
              { custom: true, label: 'Custom for this alert' },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={Boolean(ring) === option.custom}
                onClick={() =>
                  setRing(
                    option.custom ? { ringSeconds: 20, repeatMinutes: 5, maxRepeats: 0 } : null,
                  )
                }
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-medium',
                  Boolean(ring) === option.custom
                    ? 'border-accent bg-accent text-white'
                    : 'border-line/70 hover:bg-subtle',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {ring && (
            <div className="bg-subtle/60 space-y-3 rounded-2xl p-3">
              {['ringSeconds', 'repeatMinutes', 'maxRepeats'].map((key) => (
                <div key={key} className="space-y-1.5">
                  <p className="text-muted text-xs font-medium">{RING_FIELDS[key].label}</p>
                  <RingValuePicker
                    {...RING_FIELDS[key]}
                    value={ring[key]}
                    onChange={(value) => setRing((current) => ({ ...current, [key]: value }))}
                  />
                </div>
              ))}
              <p className="text-muted text-xs">
                {describeRing(ring)}. Quiet hours and “alerts off” still apply.
              </p>
            </div>
          )}
        </div>

        <DialogActions>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" loading={send.isPending} disabled={chosen.size === 0}>
            <BellRing className="h-4 w-4" aria-hidden="true" /> Send alert
            {chosen.size > 0 && ` (${chosen.size})`}
          </Button>
        </DialogActions>
      </form>

      {recent.data?.length > 0 && (
        <div className="border-line/60 mt-5 space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Recent alerts</p>
          {recent.data.slice(0, 5).map((alert) => (
            <div key={alert.id} className="space-y-1.5">
              <p className="text-muted text-xs">
                {alert.sender.name} · {timeOf(alert.createdAt)}
                {alert.message && <span className="text-ink"> · “{alert.message}”</span>}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {alert.recipients.map((recipient) => (
                  <li
                    key={recipient.userId}
                    className="bg-surface border-line/60 inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2.5 pr-1 text-xs"
                  >
                    {recipient.name}
                    <RecipientStatus recipient={recipient} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
