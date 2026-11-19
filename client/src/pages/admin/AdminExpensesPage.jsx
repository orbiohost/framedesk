import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Cloud,
  HardDrive,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { shortDate } from '../../features/admin/adminFormat.js';
import {
  useAdminCosts,
  useDeleteExpense,
  useRefreshAwsBill,
  useRefreshStorageScan,
  useSaveExpense,
  useUpdateCostSettings,
} from '../../features/admin/hooks.js';
import { StatTile } from '../../features/admin/StatTile.jsx';
import { formatBytes, formatInr } from '../../lib/format.js';

const CATEGORY_LABELS = {
  hosting: 'Hosting / server',
  storage: 'Storage',
  ai: 'AI',
  domain: 'Domain',
  email: 'Email',
  software: 'Software',
  marketing: 'Marketing',
  salaries: 'Team',
  other: 'Other',
};
const CYCLE_LABELS = { monthly: 'Monthly', yearly: 'Yearly', one_time: 'One-off' };

// Quick starts for the usual running costs.
const PRESETS = [
  { name: 'VPS server', vendor: 'Contabo', category: 'hosting', currency: 'INR', cycle: 'monthly' },
  { name: 'Domain', vendor: '', category: 'domain', currency: 'INR', cycle: 'yearly' },
  {
    name: 'Email (Google Workspace)',
    vendor: 'Google',
    category: 'email',
    currency: 'INR',
    cycle: 'monthly',
  },
  {
    name: 'Gemini API (paid tier)',
    vendor: 'Google',
    category: 'ai',
    currency: 'USD',
    cycle: 'monthly',
  },
];

// One inline policy for the app's IAM user: list the bucket (real size,
// unfinished uploads) and read the bill.
function iamPolicy(bucket) {
  return `{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:ListBucketMultipartUploads"],
      "Resource": "arn:aws:s3:::${bucket}" },
    { "Effect": "Allow",
      "Action": ["ce:GetCostAndUsage", "ce:GetCostForecast"],
      "Resource": "*" }
  ]
}`;
}

function IamHelp({ bucket, billing = false }) {
  return (
    <>
      <p className="mt-2 text-xs">
        In the AWS console: IAM → Users → the app&apos;s S3 user → Add permissions → Create inline
        policy → JSON, paste this, save, then press the button again:
      </p>
      <pre className="bg-subtle mt-1 overflow-x-auto rounded-lg p-2 text-[11px]">
        {iamPolicy(bucket)}
      </pre>
      {billing && (
        <p className="mt-1 text-xs">
          Cost Explorer must also be switched on once under Billing → Cost Explorer (data shows up
          within a day).
        </p>
      )}
    </>
  );
}

function usd(amount) {
  return `$${(amount ?? 0).toFixed(amount >= 100 ? 0 : 2)}`;
}

function ago(date) {
  return date ? formatDistanceToNow(new Date(date), { addSuffix: true }) : 'never';
}

function Row({ label, value, hint, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
      <span className="min-w-0">
        <span className={tone === 'warn' ? 'text-warning' : undefined}>{label}</span>
        {hint && <span className="text-muted block text-xs">{hint}</span>}
      </span>
      <span className="shrink-0 font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Totals({ costs }) {
  const { totals, aws, storage, month } = costs;
  const percentGone = Math.round(month.elapsed * 100);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Running cost this month"
        value={formatInr(totals.totalInr)}
        detail={`${formatInr(totals.fixedInr)} fixed · ${formatInr(totals.usageInr)} usage (projected)`}
      />
      <StatTile
        label="Revenue this month"
        value={formatInr(totals.revenueInr)}
        detail={`${percentGone}% of the month gone · on pace for ${formatInr(totals.projectedRevenueInr)}`}
        to="/admin/sales"
      />
      <StatTile
        label="Profit this month"
        value={formatInr(totals.profitInr)}
        detail={
          totals.projectedRevenueInr - totals.totalInr >= 0
            ? `On pace for ${formatInr(totals.projectedRevenueInr - totals.totalInr)}`
            : `On pace for a loss of ${formatInr(totals.totalInr - totals.projectedRevenueInr)}`
        }
      />
      <StatTile
        label="S3 storage"
        value={
          storage.bucketBytes !== null
            ? formatBytes(storage.bucketBytes + storage.incompleteBytes)
            : formatBytes(storage.countedBytes)
        }
        detail={`${formatInr(storage.monthlyInr)} a month (${usd(storage.monthlyUsd)})${aws.current ? ` · AWS bill so far ${usd(aws.totalUsd)}` : ''}`}
      />
    </div>
  );
}

function StorageCard({ costs }) {
  const { storage, settings } = costs;
  const refresh = useRefreshStorageScan();
  const busy = refresh.isPending || storage.scanning;
  return (
    <Card>
      <CardHeader
        title="Amazon S3 storage"
        description={`Bucket "${storage.bucket}" in ${storage.region}, listed object by object.`}
      />
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted flex items-center gap-1.5 text-xs">
            <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
            {storage.scanning ? 'Listing the bucket…' : `Measured ${ago(storage.scannedAt)}`}
            {storage.objects > 0 && ` · ${storage.objects.toLocaleString('en-IN')} objects`}
            {storage.truncated && ' (stopped at a million)'}
          </p>
          <Button variant="secondary" size="sm" loading={busy} onClick={() => refresh.mutate()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Measure now
          </Button>
        </div>
        {storage.scanError && (
          <Alert tone="error">
            <p>{storage.scanError}</p>
            <p className="mt-1 text-xs">
              Until then, sizes below come from the app&apos;s own count of files.
            </p>
            {/ListBucket/.test(storage.scanError) && <IamHelp bucket={storage.bucket} />}
          </Alert>
        )}
        {refresh.error && <Alert tone="error">{refresh.error.message}</Alert>}
        <div className="divide-line divide-y">
          <Row
            label="In the bucket"
            value={storage.bucketBytes !== null ? formatBytes(storage.bucketBytes) : '—'}
          />
          <Row
            label="Counted for customers"
            hint="What workspaces see against their plan"
            value={formatBytes(storage.countedBytes)}
          />
          <Row
            label="In Trash"
            hint={`${storage.trashFiles} files · still billed by AWS until Trash is emptied`}
            value={formatBytes(storage.trashBytes)}
          />
          {storage.untrackedBytes > 0 && (
            <Row
              label="Not linked to any file"
              hint="Left-overs (old versions, failed deletes) — safe to clean up"
              value={formatBytes(storage.untrackedBytes)}
              tone="warn"
            />
          )}
          {storage.incompleteUploads > 0 && (
            <Row
              label={`Unfinished uploads (${storage.incompleteUploads})`}
              hint="Parts AWS keeps and bills. Add a lifecycle rule to abort them after 7 days."
              value={formatBytes(storage.incompleteBytes)}
              tone="warn"
            />
          )}
          <Row
            label="Storage cost per month"
            hint={`At $${settings.s3PricePerGbMonthUsd}/GB · ₹${settings.usdToInr} per $ · transfer and requests not included`}
            value={`${formatInr(storage.monthlyInr)} (${usd(storage.monthlyUsd)})`}
          />
        </div>
      </div>
    </Card>
  );
}

function AwsBillCard({ costs }) {
  const { aws, settings } = costs;
  const refresh = useRefreshAwsBill();
  const denied = aws.error && /permission|not authorized|may not read/i.test(aws.error);
  return (
    <Card>
      <CardHeader
        title="AWS bill this month"
        description="Real charges from AWS Cost Explorer: storage, data transfer, requests and anything else."
      />
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted flex items-center gap-1.5 text-xs">
            <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
            Fetched {ago(aws.fetchedAt)} · AWS charges $0.01 per refresh
          </p>
          <Button
            variant="secondary"
            size="sm"
            loading={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {aws.fetchedAt ? 'Refresh' : 'Get the bill'}
          </Button>
        </div>
        {refresh.error && <Alert tone="error">{refresh.error.message}</Alert>}
        {aws.error && (
          <Alert tone="error">
            <p>{aws.error}</p>
            {denied && <IamHelp bucket={costs.storage.bucket} billing />}
          </Alert>
        )}
        {aws.fetchedAt && !aws.error && (
          <div className="divide-line divide-y">
            {!aws.current && (
              <p className="text-muted py-2 text-xs">
                This is last month&apos;s figure — refresh it.
              </p>
            )}
            {aws.services.map((service) => (
              <Row
                key={service.name}
                label={service.name}
                value={`${usd(service.amount)} · ${formatInr(service.amount * settings.usdToInr)}`}
              />
            ))}
            <Row
              label="Month to date"
              value={`${usd(aws.totalUsd)} · ${formatInr(aws.totalUsd * settings.usdToInr)}`}
            />
            {aws.forecastUsd !== null && (
              <Row
                label="Forecast for the whole month"
                value={`${usd(aws.forecastUsd)} · ${formatInr(aws.forecastUsd * settings.usdToInr)}`}
              />
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

const KIND_LABELS = {
  chat: 'AI chat',
  analysis: 'File analysis',
  brief: 'Project briefs',
  moodboard: 'Moodboards',
  social: 'Social',
  memory: 'Memory',
  skill: 'Skills',
};

function AiCard({ costs }) {
  const { ai, settings } = costs;
  return (
    <Card>
      <CardHeader
        title="AI usage this month"
        description="Gemini tokens and generated images, from every workspace."
      />
      <div className="divide-line divide-y p-5 pt-3">
        {ai.byKind.map((row) => (
          <Row
            key={row.kind}
            label={KIND_LABELS[row.kind] ?? row.kind}
            value={`${row.uses.toLocaleString('en-IN')} × · ${(row.tokens / 1e6).toFixed(2)}M tokens`}
          />
        ))}
        <Row label="Images created" value={ai.images.toLocaleString('en-IN')} />
        <Row
          label="Gemini cost so far"
          hint={
            ai.freeTier
              ? `Free tier: nothing charged. On a paid key it would be ${usd(ai.pricedUsd)}.`
              : `At $${settings.aiPricePerMillionTokensUsd} per million tokens`
          }
          value={formatInr((ai.chargedUsd - ai.imagesUsd) * settings.usdToInr)}
        />
        <Row
          label="Projected for the month"
          value={`${formatInr(ai.projectedUsd * settings.usdToInr)} (${usd(ai.projectedUsd)})`}
        />
      </div>
    </Card>
  );
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function toInput(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : '';
}

function ExpenseForm({ initial, onDone }) {
  const save = useSaveExpense();
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? '',
    vendor: initial?.vendor ?? '',
    category: initial?.category ?? 'hosting',
    amount: initial?.amount !== undefined ? String(initial.amount) : '',
    currency: initial?.currency ?? 'INR',
    cycle: initial?.cycle ?? 'monthly',
    startedAt: toInput(initial?.startedAt) || todayInput(),
    endedAt: toInput(initial?.endedAt),
    renewsAt: toInput(initial?.renewsAt),
    note: initial?.note ?? '',
  }));
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const amount = Number(form.amount);
  const valid = form.name.trim() && form.amount !== '' && Number.isFinite(amount) && amount >= 0;

  function submit(event) {
    event.preventDefault();
    if (!valid) return;
    save.mutate(
      {
        id: initial?.id,
        ...form,
        amount,
        endedAt: form.endedAt || null,
        renewsAt: form.renewsAt || null,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="expense-name"
          label="What"
          value={form.name}
          onChange={set('name')}
          autoFocus
        />
        <TextField
          id="expense-vendor"
          label="Paid to"
          value={form.vendor}
          onChange={set('vendor')}
        />
        <TextField
          id="expense-amount"
          label="Amount"
          inputMode="decimal"
          value={form.amount}
          onChange={set('amount')}
          placeholder="e.g. 1200"
        />
        <SelectField
          id="expense-currency"
          label="Currency"
          value={form.currency}
          onChange={set('currency')}
          options={[
            { value: 'INR', label: '₹ Rupees' },
            { value: 'USD', label: '$ US dollars' },
          ]}
        />
        <SelectField
          id="expense-cycle"
          label="Billed"
          value={form.cycle}
          onChange={set('cycle')}
          options={Object.entries(CYCLE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <SelectField
          id="expense-category"
          label="Category"
          value={form.category}
          onChange={set('category')}
          options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <TextField
          id="expense-start"
          label={form.cycle === 'one_time' ? 'Paid on' : 'Since'}
          type="date"
          value={form.startedAt}
          onChange={set('startedAt')}
        />
        {form.cycle !== 'one_time' && (
          <TextField
            id="expense-renews"
            label="Renews on"
            type="date"
            value={form.renewsAt}
            onChange={set('renewsAt')}
            hint="Optional, for a reminder here"
          />
        )}
        {form.cycle !== 'one_time' && (
          <TextField
            id="expense-end"
            label="Stopped on"
            type="date"
            value={form.endedAt}
            onChange={set('endedAt')}
            hint="Leave empty while you still pay it"
          />
        )}
        <TextField id="expense-note" label="Note" value={form.note} onChange={set('note')} />
      </div>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!valid}>
          {initial?.id ? 'Save' : 'Add expense'}
        </Button>
      </DialogActions>
    </form>
  );
}

function ExpensesCard({ costs }) {
  const [editing, setEditing] = useState(null);
  const remove = useDeleteExpense();
  const active = costs.expenses.filter((expense) => expense.active);
  const stopped = costs.expenses.filter((expense) => !expense.active);
  const soon = new Date(costs.generatedAt).getTime() + 14 * 24 * 3600 * 1000;

  function line(expense) {
    const renewing =
      expense.active && expense.renewsAt && new Date(expense.renewsAt).getTime() < soon;
    return (
      <li key={expense.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {expense.name}
            {expense.vendor && <span className="text-muted font-normal"> · {expense.vendor}</span>}
          </p>
          <p className="text-muted text-xs">
            {CATEGORY_LABELS[expense.category]} · {CYCLE_LABELS[expense.cycle]}{' '}
            {expense.currency === 'USD' ? `$${expense.amount}` : formatInr(expense.amount)}
            {expense.active
              ? ` · since ${shortDate(expense.startedAt)}`
              : ` · stopped ${shortDate(expense.endedAt)}`}
            {expense.note && ` · ${expense.note}`}
          </p>
          {renewing && (
            <p className="text-warning mt-0.5 flex items-center gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Renews {shortDate(expense.renewsAt)}
            </p>
          )}
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {formatInr(expense.monthlyInr)}
          <span className="text-muted text-xs font-normal">/mo</span>
        </span>
        <div className="flex">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditing(expense)}
            aria-label={`Edit ${expense.name}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (window.confirm(`Delete "${expense.name}"?`)) remove.mutate(expense.id);
            }}
            aria-label={`Delete ${expense.name}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Expenses"
        description="Everything you pay to run the app. Yearly costs count as one twelfth a month."
      />
      <div className="space-y-3 p-5 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add expense
          </Button>
          {PRESETS.filter(
            (preset) => !costs.expenses.some((expense) => expense.name === preset.name),
          ).map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => setEditing(preset)}
              className="border-line text-muted hover:text-ink hover:bg-subtle rounded-full border px-3 py-1 text-xs"
            >
              + {preset.name}
            </button>
          ))}
        </div>
        {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
        {costs.expenses.length === 0 ? (
          <p className="text-muted py-4 text-sm">
            No expenses yet. Add your VPS, domain and other bills to see the real monthly cost.
          </p>
        ) : (
          <ul className="divide-line divide-y">{[...active, ...stopped].map(line)}</ul>
        )}
        <div className="border-line flex justify-between border-t pt-3 text-sm font-semibold">
          <span>Fixed costs per month</span>
          <span className="tabular-nums">{formatInr(costs.totals.fixedInr)}</span>
        </div>
      </div>
      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit "${editing.name}"` : 'Add an expense'}
        wide
      >
        {editing && <ExpenseForm initial={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </Card>
  );
}

function PricingCard({ costs }) {
  const update = useUpdateCostSettings();
  const [form, setForm] = useState(() => ({
    usdToInr: String(costs.settings.usdToInr),
    s3PricePerGbMonthUsd: String(costs.settings.s3PricePerGbMonthUsd),
    aiPricePerMillionTokensUsd: String(costs.settings.aiPricePerMillionTokensUsd),
    imagePriceUsd: String(costs.settings.imagePriceUsd),
  }));
  const numbers = Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, Number(value)]),
  );
  const valid = Object.values(numbers).every((value) => Number.isFinite(value) && value >= 0);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Card>
      <CardHeader
        title="Prices used for estimates"
        description="Match these to your bills. The AWS bill above is always the real figure."
      />
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) update.mutate(numbers);
        }}
      >
        {update.error && <Alert tone="error">{update.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="cost-rate"
            label="₹ per US dollar"
            inputMode="decimal"
            value={form.usdToInr}
            onChange={set('usdToInr')}
          />
          <TextField
            id="cost-s3"
            label="S3 storage, $ per GB a month"
            inputMode="decimal"
            value={form.s3PricePerGbMonthUsd}
            onChange={set('s3PricePerGbMonthUsd')}
          />
          <TextField
            id="cost-ai"
            label="Gemini, $ per million tokens"
            inputMode="decimal"
            value={form.aiPricePerMillionTokensUsd}
            onChange={set('aiPricePerMillionTokensUsd')}
            hint="Blended input + output"
          />
          <TextField
            id="cost-image"
            label="Image creation, $ per image"
            inputMode="decimal"
            value={form.imagePriceUsd}
            onChange={set('imagePriceUsd')}
            hint="0 while on Cloudflare's free allowance"
          />
        </div>
        <Switch
          checked={costs.settings.aiFreeTier}
          onChange={(checked) => update.mutate({ aiFreeTier: checked })}
          label="Gemini key is on the free tier"
          description="Nothing is charged; the page shows what it would cost on a paid key."
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={update.isPending} disabled={!valid}>
            Save prices
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AdminExpensesPage() {
  const { data: costs, isPending, isError, error } = useAdminCosts();
  if (isError) return <Alert tone="error">{error.message}</Alert>;
  if (isPending) return <Skeleton className="h-96 w-full" />;

  return (
    <>
      <PageHeader
        title="Expenses & costs"
        description="What it costs to run FrameDesk this month, against what it earns. Amounts in INR."
      />
      <div className="max-w-7xl space-y-6">
        <Totals costs={costs} />
        <div className="grid gap-4 lg:grid-cols-2">
          <StorageCard costs={costs} />
          <AwsBillCard costs={costs} />
        </div>
        <ExpensesCard costs={costs} />
        <div className="grid gap-4 lg:grid-cols-2">
          <AiCard costs={costs} />
          <PricingCard key={costs.settings.usdToInr} costs={costs} />
        </div>
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Usage costs are projected to the end of the month from what has been used so far.
        </p>
      </div>
    </>
  );
}
