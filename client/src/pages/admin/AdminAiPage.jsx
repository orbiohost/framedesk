import { CircleAlert, CircleCheck, Plus, Trash2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { SettingsRow, SettingsSection } from '../../features/account/SettingsSection.jsx';
import { BILLING_STATUS, dateTime, shortDate } from '../../features/admin/adminFormat.js';
import {
  useAdjustAiCredits,
  useAdminAi,
  useAdminAiAccounts,
  useAdminAiLedger,
  useResetAiLimits,
  useSetAiAccess,
  useUpdateAdminAi,
} from '../../features/admin/hooks.js';
import { StatTile } from '../../features/admin/StatTile.jsx';

const number = (value) => Number(value ?? 0).toLocaleString('en-IN');

const LEDGER_LABELS = {
  chat: 'Question',
  analysis: 'File analysed',
  brief: 'Project brief written',
  moodboard: 'Moodboard AI',
  social: 'Social media AI',
  purchase: 'Bought',
  grant: 'Admin adjustment',
  refund: 'Refund',
};

function toForm(settings) {
  return {
    ...settings,
    planLimits: Object.fromEntries(
      Object.entries(settings.planLimits).map(([code, limits]) => [
        code,
        { session: String(limits.session), weekly: String(limits.weekly) },
      ]),
    ),
    freeLimits: {
      session: String(settings.freeLimits.session),
      weekly: String(settings.freeLimits.weekly),
    },
    trialLimits: {
      session: String(settings.trialLimits.session),
      weekly: String(settings.trialLimits.weekly),
    },
    resetPrices: Object.fromEntries(
      Object.entries(settings.resetPrices ?? {}).map(([code, price]) => [code, String(price)]),
    ),
    tokensPerCredit: String(settings.tokensPerCredit),
    minChatCredits: String(settings.minChatCredits),
    minAnalysisCredits: String(settings.minAnalysisCredits),
    maxAnalysisMB: String(settings.maxAnalysisMB),
    packs: settings.packs.map((pack) => ({
      code: pack.code,
      credits: String(pack.credits),
      price: String(pack.price),
    })),
  };
}

const toInt = (value) => Math.trunc(Number(value));

function toPayload(form) {
  return {
    enabled: form.enabled,
    autoAnalyze: form.autoAnalyze,
    model: form.model.trim(),
    planLimits: Object.fromEntries(
      Object.entries(form.planLimits).map(([code, limits]) => [
        code,
        { session: toInt(limits.session), weekly: toInt(limits.weekly) },
      ]),
    ),
    freeLimits: {
      session: toInt(form.freeLimits.session),
      weekly: toInt(form.freeLimits.weekly),
    },
    trialLimits: {
      session: toInt(form.trialLimits.session),
      weekly: toInt(form.trialLimits.weekly),
    },
    resetPrices: Object.fromEntries(
      Object.entries(form.resetPrices).map(([code, price]) => [code, toInt(price)]),
    ),
    tokensPerCredit: toInt(form.tokensPerCredit),
    minChatCredits: toInt(form.minChatCredits),
    minAnalysisCredits: toInt(form.minAnalysisCredits),
    maxAnalysisMB: toInt(form.maxAnalysisMB),
    // A pack keeps its code once it exists, so open checkouts stay valid.
    packs: form.packs.map((pack) => ({
      code: pack.code || `pack-${toInt(pack.credits)}`,
      credits: toInt(pack.credits),
      price: toInt(pack.price),
    })),
  };
}

function StatusLine({ ok, children }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <p className={`flex items-center gap-2 text-sm ${ok ? 'text-success' : 'text-danger'}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-ink">{children}</span>
    </p>
  );
}

function Usage({ usage }) {
  const { files, last30Days } = usage;
  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Files analysed"
        value={number(files.analysed)}
        detail={`${number(files.skipped)} skipped · ${number(files.failed)} failed`}
      />
      <StatTile
        label="Waiting"
        value={number(files.waiting)}
        detail={`${number(files.waitingForCredits)} waiting for credits`}
      />
      <StatTile
        label="Questions, 30 days"
        value={number(last30Days.chat.count)}
        detail={`${number(last30Days.chat.credits)} credits · ${number(last30Days.chat.tokens)} tokens`}
      />
      <StatTile
        label="Analysis, 30 days"
        value={number(last30Days.analysis.count)}
        detail={`${number(last30Days.analysis.credits)} credits · ${number(last30Days.analysis.tokens)} tokens`}
      />
    </div>
  );
}

function PacksEditor({ packs, onChange }) {
  function update(index, field, value) {
    onChange(packs.map((pack, i) => (i === index ? { ...pack, [field]: value } : pack)));
  }
  return (
    <div className="space-y-3">
      {packs.map((pack, index) => (
        <div
          key={pack.code || `new-${index}`}
          className="grid grid-cols-[1fr_1fr_auto] items-end gap-3"
        >
          <TextField
            id={`pack-credits-${index}`}
            label="Credits"
            type="number"
            min="1"
            value={pack.credits}
            onChange={(event) => update(index, 'credits', event.target.value)}
          />
          <TextField
            id={`pack-price-${index}`}
            label="Price (₹, before GST)"
            type="number"
            min="1"
            value={pack.price}
            onChange={(event) => update(index, 'price', event.target.value)}
          />
          <Button
            type="button"
            size="icon-md"
            variant="ghost"
            aria-label="Remove this pack"
            disabled={packs.length === 1}
            onClick={() => onChange(packs.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      {packs.length < 8 && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange([...packs, { code: '', credits: '', price: '' }])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add a pack
        </Button>
      )}
    </div>
  );
}

function SettingsForm({ data }) {
  const update = useUpdateAdminAi();
  const [form, setForm] = useState(() => toForm(data.settings));
  const [saved, setSaved] = useState(false);
  const set = (field) => (value) => {
    setSaved(false);
    setForm((current) => ({ ...current, [field]: value }));
  };
  const input = (field) => (event) => set(field)(event.target.value);
  const fieldError = (field) => update.error?.fieldError?.(field);

  function submit(event) {
    event.preventDefault();
    update.mutate(toPayload(form), {
      onSuccess: (result) => {
        setForm(toForm(result.settings));
        setSaved(true);
      },
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <SettingsSection
        title="Assistant"
        description="The sparkle button in the bottom-right corner of every workspace."
      >
        <SettingsRow
          label="Gemini API key"
          description="GEMINI_API_KEY in the server's .env. Keys never pass through this page."
        >
          {data.gemini.configured ? (
            <StatusLine ok>
              Connected <span className="text-muted">· {data.gemini.keyHint}</span>
            </StatusLine>
          ) : (
            <StatusLine ok={false}>
              Not set. Add GEMINI_API_KEY to server/.env and restart the API.
            </StatusLine>
          )}
        </SettingsRow>
        <SettingsRow
          label="Turn on for everyone"
          description="Off hides the assistant for all users and stops analysis. Nothing is deleted."
          align="center"
        >
          <Switch
            checked={form.enabled}
            onChange={set('enabled')}
            label={form.enabled ? 'On' : 'Off'}
            description={form.enabled ? 'every workspace sees the assistant' : 'hidden everywhere'}
          />
        </SettingsRow>
        <SettingsRow
          label="Analyse in the background"
          description="Off (recommended): a file is studied, and credits are used, only when someone asks about it. On: every upload is studied in the background right away, using credits even if nobody asks."
          align="center"
        >
          <Switch
            checked={form.autoAnalyze}
            onChange={set('autoAnalyze')}
            label={form.autoAnalyze ? 'On' : 'Off'}
            description={
              form.autoAnalyze ? 'every upload, in the background' : 'only when someone asks'
            }
          />
        </SettingsRow>
        <SettingsRow label="Model" description="Any Gemini model your key can use.">
          <TextField
            id="ai-model"
            label="Gemini model"
            value={form.model}
            onChange={input('model')}
            error={fieldError('model')}
            placeholder="gemini-3.5-flash"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Usage limits"
        description="Like Claude: a 5-hour session limit that refreshes after 5 hours, inside a weekly limit that resets 7 days after it starts. Counted in credits; people see percentages."
      >
        {[{ code: 'free', name: 'Free plan' }, ...data.plans].map((plan) => {
          const isFree = plan.code === 'free';
          const limits = isFree ? form.freeLimits : (form.planLimits[plan.code] ?? {});
          const update = (field) => (event) => {
            const next = { ...limits, [field]: event.target.value };
            if (isFree) set('freeLimits')(next);
            else set('planLimits')({ ...form.planLimits, [plan.code]: next });
          };
          const errorPath = isFree ? 'freeLimits' : `planLimits.${plan.code}`;
          return (
            <SettingsRow
              key={plan.code}
              label={plan.name}
              description={
                isFree ? 'Every account that has not paid for a plan (2 GB).' : undefined
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id={`ai-${plan.code}-session`}
                  label="Per 5-hour session"
                  type="number"
                  min="0"
                  value={limits.session ?? '0'}
                  error={fieldError(`${errorPath}.session`)}
                  onChange={update('session')}
                />
                <TextField
                  id={`ai-${plan.code}-weekly`}
                  label="Per week"
                  type="number"
                  min="0"
                  value={limits.weekly ?? '0'}
                  error={fieldError(`${errorPath}.weekly`)}
                  onChange={update('weekly')}
                />
              </div>
            </SettingsRow>
          );
        })}
      </SettingsSection>

      <SettingsSection
        title="Limit reset price"
        description="What an owner pays to start their 5-hour and weekly limits over right away (₹, before GST). 0 turns resets off for that plan."
      >
        <SettingsRow
          label="Per plan"
          description="Suggested: about half of what a week's limit costs in extra-usage packs."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {[{ code: 'free', name: 'Free plan' }, ...data.plans].map((plan) => (
              <TextField
                key={plan.code}
                id={`ai-reset-${plan.code}`}
                label={plan.name}
                type="number"
                min="0"
                value={form.resetPrices[plan.code] ?? '0'}
                error={fieldError(`resetPrices.${plan.code}`)}
                onChange={(event) =>
                  set('resetPrices')({ ...form.resetPrices, [plan.code]: event.target.value })
                }
              />
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="What things cost"
        description="Credits are charged from the tokens Gemini reports, with a minimum per action."
      >
        <SettingsRow
          label="Tokens per credit"
          description="10,000 means a typical question uses 1–3 credits and a 10-minute clip about 6."
        >
          <TextField
            id="ai-tokens"
            label="Tokens"
            type="number"
            min="100"
            value={form.tokensPerCredit}
            error={fieldError('tokensPerCredit')}
            onChange={input('tokensPerCredit')}
          />
        </SettingsRow>
        <SettingsRow label="Minimums" description="The least a question or a file analysis costs.">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="ai-min-chat"
              label="Per question"
              type="number"
              min="0"
              value={form.minChatCredits}
              error={fieldError('minChatCredits')}
              onChange={input('minChatCredits')}
            />
            <TextField
              id="ai-min-analysis"
              label="Per file analysed"
              type="number"
              min="0"
              value={form.minAnalysisCredits}
              error={fieldError('minAnalysisCredits')}
              onChange={input('minAnalysisCredits')}
            />
          </div>
        </SettingsRow>
        <SettingsRow
          label="Largest file sent to Gemini"
          description="Bigger files are analysed from their transcript instead (Gemini's limit is 2,000 MB)."
        >
          <TextField
            id="ai-max-mb"
            label="MB"
            type="number"
            min="1"
            max="2000"
            value={form.maxAnalysisMB}
            error={fieldError('maxAnalysisMB')}
            onChange={input('maxAnalysisMB')}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Credit packs"
        description="What customers can buy on the Upgrade page, paid through Razorpay. Bought credits never expire."
      >
        <SettingsRow label="Packs" description="Up to 8. GST is added on top when it applies.">
          <PacksEditor packs={form.packs} onChange={set('packs')} />
          {fieldError('packs') && <p className="text-danger mt-2 text-sm">{fieldError('packs')}</p>}
        </SettingsRow>
      </SettingsSection>

      {update.error && !update.error.details && <Alert tone="error">{update.error.message}</Alert>}
      {update.error?.details && (
        <Alert tone="error">Some values need fixing. Check the fields marked above.</Alert>
      )}
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-success text-sm">Saved</span>}
        <p className="text-muted mr-auto text-xs">
          {data.settings.updatedAt
            ? `Last saved ${dateTime(data.settings.updatedAt)}.`
            : 'Not saved yet; defaults apply.'}
        </p>
        <Button type="submit" loading={update.isPending}>
          Save AI settings
        </Button>
      </div>
    </form>
  );
}

function AdjustCreditsDialog({ account, onClose }) {
  const adjust = useAdjustAiCredits();
  const [direction, setDirection] = useState('add');
  const [amount, setAmount] = useState('100');
  const [note, setNote] = useState('');

  function submit(event) {
    event.preventDefault();
    const credits = Math.trunc(Number(amount)) * (direction === 'add' ? 1 : -1);
    adjust.mutate(
      { workspaceId: account.workspaceId, credits, note: note.trim() || undefined },
      { onSuccess: onClose },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {adjust.error && <Alert tone="error">{adjust.error.message}</Alert>}
      <p className="text-muted text-sm">
        This session {account.credits.session.percent}% used, this week{' '}
        {account.credits.weekly.percent}% used, {number(account.credits.extra)} credits of extra
        usage. Changes apply to extra usage, which is used after a limit is reached and never
        expires.
      </p>
      <SegmentedControl
        label="Add or remove"
        options={[
          { value: 'add', label: 'Give credits' },
          { value: 'remove', label: 'Take away' },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <TextField
        id="adjust-credits"
        label="Credits"
        type="number"
        min="1"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <TextField
        id="adjust-note"
        label="Note (optional)"
        maxLength={200}
        placeholder="e.g. Goodwill for the outage on 12 Nov"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={adjust.isPending}
          disabled={!(Math.trunc(Number(amount)) > 0)}
        >
          {direction === 'add' ? 'Give' : 'Take away'} {number(Math.trunc(Number(amount)) || 0)}{' '}
          credits
        </Button>
      </DialogActions>
    </form>
  );
}

function LedgerList({ workspaceId }) {
  const ledger = useAdminAiLedger(workspaceId);
  const entries = ledger.data?.pages.flatMap((page) => page.entries) ?? [];
  if (ledger.isPending) return <Skeleton className="h-40" />;
  if (ledger.isError) return <Alert tone="error">{ledger.error.message}</Alert>;
  if (entries.length === 0) return <p className="text-muted text-sm">No credit activity yet.</p>;
  return (
    <div>
      <ul className="divide-line/70 border-line/70 divide-y rounded-2xl border">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate">
                {LEDGER_LABELS[entry.kind] ?? entry.kind}
                {entry.fileName && <span className="text-muted"> · {entry.fileName}</span>}
                {entry.note && entry.kind !== 'analysis' && (
                  <span className="text-muted"> · {entry.note}</span>
                )}
              </p>
              <p className="text-muted text-xs">
                {dateTime(entry.at)}
                {entry.user && ` · ${entry.user}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={entry.credits > 0 ? 'text-success font-medium' : 'font-medium'}>
                {entry.credits > 0 ? '+' : ''}
                {number(entry.credits)}
              </p>
              {entry.balanceAfter !== null && (
                <p className="text-muted text-xs">→ {number(entry.balanceAfter)}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {ledger.hasNextPage && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          loading={ledger.isFetchingNextPage}
          onClick={() => ledger.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </div>
  );
}

function AccountRow({ account, onAdjust, onHistory }) {
  const access = useSetAiAccess();
  const resetLimits = useResetAiLimits();
  const status = BILLING_STATUS[account.status] ?? BILLING_STATUS.none;
  return (
    <tr>
      <td className="px-4 py-3">
        <span className="block font-medium">{account.workspaceName}</span>
        <span className="text-muted block">{account.owner?.email ?? 'Owner missing'}</span>
      </td>
      <td className="hidden px-4 py-3 md:table-cell">
        <span className="block">{account.planName ?? 'No plan'}</span>
        <Badge tone={status.tone} className="mt-1">
          {status.label}
        </Badge>
      </td>
      <td className="px-4 py-3 tabular-nums">
        <span className="block text-sm">
          <span className="font-medium">{account.credits.session.percent}%</span>
          <span className="text-muted"> session · </span>
          <span className="font-medium">{account.credits.weekly.percent}%</span>
          <span className="text-muted"> week</span>
        </span>
        <span className="text-muted block text-xs">{number(account.credits.extra)} extra</span>
      </td>
      <td className="hidden px-4 py-3 lg:table-cell">
        {account.blocked ? <Badge tone="danger">AI off</Badge> : <Badge tone="success">On</Badge>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => onHistory(account)}>
            History
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={access.isPending}
            onClick={() =>
              access.mutate({ workspaceId: account.workspaceId, blocked: !account.blocked })
            }
          >
            {account.blocked ? 'Turn AI on' : 'Turn AI off'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={resetLimits.isPending}
            disabled={account.credits.session.percent === 0 && account.credits.weekly.percent === 0}
            onClick={() => resetLimits.mutate({ workspaceId: account.workspaceId })}
          >
            Reset limits
          </Button>
          <Button size="sm" onClick={() => onAdjust(account)}>
            Extra usage
          </Button>
        </div>
      </td>
    </tr>
  );
}

function Accounts() {
  const [search, setSearch] = useState('');
  const accounts = useAdminAiAccounts({ q: useDeferredValue(search.trim()) });
  const [adjusting, setAdjusting] = useState(null);
  const [viewing, setViewing] = useState(null);

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Accounts</h2>
          <p className="text-muted text-sm">
            Give or take away credits, or turn the assistant off for one account.
          </p>
        </div>
        <SearchInput
          label="Search accounts"
          placeholder="Workspace or owner email"
          value={search}
          onChange={setSearch}
          className="w-full sm:w-72"
        />
      </div>
      {accounts.isError && <Alert tone="error">{accounts.error.message}</Alert>}
      {accounts.isPending && <Skeleton className="h-48 w-full" />}
      {accounts.data && (
        <div className="border-line bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-line text-muted border-b text-left text-xs uppercase tracking-[0.1em]">
              <tr>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Plan</th>
                <th className="px-4 py-2 font-medium">Usage</th>
                <th className="hidden px-4 py-2 font-medium lg:table-cell">Assistant</th>
                <th className="px-4 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {accounts.data.map((account) => (
                <AccountRow
                  key={account.workspaceId}
                  account={account}
                  onAdjust={setAdjusting}
                  onHistory={setViewing}
                />
              ))}
            </tbody>
          </table>
          {accounts.data.length === 0 && (
            <p className="text-muted p-6 text-center text-sm">No accounts match.</p>
          )}
        </div>
      )}
      <Dialog
        open={Boolean(adjusting)}
        onClose={() => setAdjusting(null)}
        title={adjusting ? `Extra usage · ${adjusting.workspaceName}` : 'Extra usage'}
      >
        {adjusting && (
          <AdjustCreditsDialog account={adjusting} onClose={() => setAdjusting(null)} />
        )}
      </Dialog>
      <Dialog
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        wide
        title={viewing ? `Credit history · ${viewing.workspaceName}` : 'Credit history'}
        description={
          viewing
            ? `Session ${viewing.credits.session.percent}% · week ${viewing.credits.weekly.percent}%${
                viewing.credits.weekly.resetsAt
                  ? ` · week resets ${shortDate(viewing.credits.weekly.resetsAt)}`
                  : ''
              }`
            : undefined
        }
      >
        {viewing && <LedgerList workspaceId={viewing.workspaceId} />}
      </Dialog>
    </section>
  );
}

export function AdminAiPage() {
  const { data, isPending, isError, error } = useAdminAi();
  return (
    <>
      <PageHeader
        title="AI assistant"
        description="Google Gemini answers questions about each workspace's files. Switch it on or off for everyone, set monthly credits and packs, and manage each account's balance."
      />
      {isPending && <Skeleton className="h-96 w-full" />}
      {isError && <Alert tone="error">{error.message}</Alert>}
      {data && (
        <>
          {data.settings.enabled && !data.gemini.configured && (
            <Alert tone="error" className="mb-6">
              The assistant is switched on but GEMINI_API_KEY isn&apos;t set, so nobody sees it yet.
            </Alert>
          )}
          <Usage usage={data.usage} />
          <SettingsForm key={data.settings.updatedAt ?? 'defaults'} data={data} />
          <Accounts />
        </>
      )}
    </>
  );
}
