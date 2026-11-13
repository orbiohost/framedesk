import {
  Check,
  Copy,
  Eye,
  Globe,
  Info,
  Link2,
  Lock,
  Pencil,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import {
  SHARE_AUDIENCE_OPTIONS,
  SHARE_PERMISSION_OPTIONS,
  shareUrl,
  useResetShareLink,
  useShareSettings,
  useUpdateShare,
} from './hooks.js';

const OPTION_ICONS = { anyone: Globe, signed_in: UserRound, view: Eye, edit: Pencil };

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        'focus-visible:ring-accent/30 outline-none focus-visible:ring-4',
        'disabled:cursor-wait disabled:opacity-60',
        checked ? 'bg-accent' : 'bg-line',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

// Two side-by-side choice cards, each with an icon, a label and a short hint.
export function ChoiceGroup({ legend, name, options, value, onChange, disabled }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-muted mb-2 text-xs font-medium uppercase tracking-[0.1em]">
        {legend}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const Icon = OPTION_ICONS[option.value];
          const active = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex cursor-pointer flex-col gap-2 rounded-2xl border p-3 transition-colors',
                'has-[:focus-visible]:ring-accent/30 has-[:focus-visible]:ring-4',
                active ? 'border-accent bg-accent/10' : 'border-line hover:bg-subtle',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="flex items-center justify-between">
                <span
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-xl',
                    active ? 'bg-accent text-accent-ink' : 'bg-subtle text-muted',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {active && <Check className="text-accent h-4 w-4" aria-hidden="true" />}
              </span>
              <span>
                <span className="block text-sm font-medium leading-tight">{option.label}</span>
                <span className="text-muted mt-0.5 block text-xs leading-snug">{option.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CopyLinkField({ url }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-line bg-subtle/60 flex items-center gap-2 rounded-full border py-1 pl-4 pr-1">
      <Link2 className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
      <input
        readOnly
        value={url}
        aria-label="Share link"
        onFocus={(event) => event.target.select()}
        className="text-muted min-w-0 flex-1 truncate bg-transparent text-sm outline-none"
      />
      <Button size="sm" onClick={copy} className="shrink-0 whitespace-nowrap">
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  );
}

export function ShareProjectDialog({ workspaceId, project, open, onClose }) {
  const {
    data: share,
    isPending,
    error,
  } = useShareSettings(workspaceId, project.id, {
    enabled: open,
  });
  const update = useUpdateShare(workspaceId, project.id);
  const reset = useResetShareLink(workspaceId, project.id);
  const [confirmReset, setConfirmReset] = useState(false);

  const busy = update.isPending || reset.isPending;
  const mutationError = update.error ?? reset.error;

  function close() {
    setConfirmReset(false);
    update.reset();
    reset.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Share "${project.title}"`}
      description="Send a link to the full project view."
    >
      {isPending && <Skeleton className="h-64 w-full" />}
      {error && <Alert tone="error">{error.message}</Alert>}

      {share && (
        <div className="space-y-5">
          <div
            className={cn(
              'rounded-2xl border p-4 transition-colors',
              share.enabled ? 'border-success/30 bg-success/5' : 'border-line',
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                  share.enabled ? 'bg-success/15 text-success' : 'bg-subtle text-muted',
                )}
              >
                {share.enabled ? (
                  <Globe className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Lock className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {share.enabled ? 'Public link is on' : 'Public link is off'}
                </p>
                <p className="text-muted text-xs">
                  {share.enabled
                    ? 'Switch off to remove the project from public.'
                    : 'Only workspace members can see this project.'}
                </p>
              </div>
              <Switch
                checked={share.enabled}
                disabled={busy}
                label={share.enabled ? 'Remove from public' : 'Turn on public link'}
                onChange={(enabled) => update.mutate({ enabled })}
              />
            </div>
            {share.enabled && share.token && (
              <div className="mt-4">
                <CopyLinkField url={shareUrl(share.token)} />
              </div>
            )}
          </div>

          <ChoiceGroup
            legend="Who can open it"
            name="share-audience"
            options={SHARE_AUDIENCE_OPTIONS}
            value={share.audience}
            disabled={busy}
            onChange={(audience) => update.mutate({ audience })}
          />
          <ChoiceGroup
            legend="What they can do"
            name="share-permission"
            options={SHARE_PERMISSION_OPTIONS}
            value={share.permission}
            disabled={busy}
            onChange={(permission) => update.mutate({ permission })}
          />

          <p className="text-muted flex gap-2 text-xs leading-relaxed">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Visitors never see the budget, private notes or restricted folders. Changes apply
            instantly, even for people who already have the link.
          </p>

          {mutationError && <Alert tone="error">{mutationError.message}</Alert>}
        </div>
      )}

      <div className="border-line/70 mt-6 flex items-center justify-between gap-3 border-t pt-4">
        {share?.token ? (
          confirmReset ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted text-xs">Old link stops working.</span>
              <Button
                variant="danger"
                size="sm"
                loading={reset.isPending}
                onClick={() => reset.mutate(undefined, { onSuccess: () => setConfirmReset(false) })}
              >
                Reset
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmReset(true)}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reset link
            </Button>
          )
        ) : (
          <span />
        )}
        <Button onClick={close}>Done</Button>
      </div>
    </Dialog>
  );
}
