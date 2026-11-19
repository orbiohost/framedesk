import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { SettingsRow, SettingsSection } from '../../features/account/SettingsSection.jsx';
import { shortDate } from '../../features/admin/adminFormat.js';
import { PlanProfitCalculator } from '../../features/admin/PlanProfitCalculator.jsx';
import {
  useAdminCoupons,
  useAdminPlans,
  useDeleteCoupon,
  useSaveCoupon,
  useUpdateAdminPlans,
} from '../../features/admin/hooks.js';
import { formatInr } from '../../lib/format.js';

const PLAN_LABELS = { starter: 'Starter', studio: 'Studio', agency: 'Agency' };
const int = (value) => (value === '' || value === null ? null : Math.round(Number(value)));
const lines = (text) =>
  String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
const toDateInput = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');

function toForm(catalog) {
  return {
    plans: Object.fromEntries(
      catalog.plans.map((plan) => [
        plan.code,
        {
          name: plan.name,
          summary: plan.summary ?? '',
          features: plan.features.join('\n'),
          monthlyPrice: String(plan.monthlyPrice),
          yearlyPrice: plan.yearlyPrice ? String(plan.yearlyPrice) : '',
          storageGB: String(plan.storageGB),
          highlighted: plan.highlighted,
        },
      ]),
    ),
    free: {
      name: catalog.free.name,
      summary: catalog.free.summary ?? '',
      features: catalog.free.features.join('\n'),
      storageGB: String(catalog.free.storageGB),
    },
    offer: {
      enabled: catalog.offer.enabled,
      code: catalog.offer.code,
      label: catalog.offer.label,
      percentOff: String(catalog.offer.percentOff),
      endsAt: toDateInput(catalog.offer.endsAt),
    },
    referral: {
      enabled: catalog.referral.enabled,
      rewardGB: String(catalog.referral.rewardGB),
      rewardLimit: String(catalog.referral.rewardLimit),
      discountPercent: String(catalog.referral.discountPercent),
    },
    pricing: {
      maxDiscountPercent: String(catalog.pricing?.maxDiscountPercent ?? 50),
    },
  };
}

function toInput(form) {
  return {
    plans: Object.fromEntries(
      Object.entries(form.plans).map(([code, plan]) => [
        code,
        {
          name: plan.name.trim(),
          summary: plan.summary.trim(),
          features: lines(plan.features),
          monthlyPrice: int(plan.monthlyPrice),
          yearlyPrice: int(plan.yearlyPrice),
          storageGB: int(plan.storageGB),
          highlighted: plan.highlighted,
        },
      ]),
    ),
    free: {
      name: form.free.name.trim(),
      summary: form.free.summary.trim(),
      features: lines(form.free.features),
      storageGB: Number(form.free.storageGB),
    },
    offer: {
      enabled: form.offer.enabled,
      code: form.offer.code.trim(),
      label: form.offer.label.trim(),
      percentOff: int(form.offer.percentOff),
      // The end of that day in India.
      endsAt: form.offer.endsAt ? `${form.offer.endsAt}T23:59:59+05:30` : null,
    },
    referral: {
      enabled: form.referral.enabled,
      rewardGB: Number(form.referral.rewardGB),
      rewardLimit: int(form.referral.rewardLimit),
      discountPercent: int(form.referral.discountPercent),
    },
    pricing: {
      maxDiscountPercent: int(form.pricing.maxDiscountPercent) ?? 0,
    },
  };
}

function CatalogForm({ catalog }) {
  const [form, setForm] = useState(() => toForm(catalog));
  const save = useUpdateAdminPlans();
  const setIn = (section, field) => (value) =>
    setForm((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
  const setPlan = (code, field) => (value) =>
    setForm((current) => ({
      ...current,
      plans: { ...current.plans, [code]: { ...current.plans[code], [field]: value } },
    }));
  const input = (setter) => (event) => setter(event.target.value);
  const fieldError = (path) => save.error?.details?.find?.((d) => d.path === path)?.message;

  function submit(event) {
    event.preventDefault();
    save.mutate(toInput(form));
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <SettingsSection
        title="Paid plans"
        description="Prices are in rupees before GST. Changes show on the website and upgrade page at once; people already paying keep the price they paid until they renew."
      >
        {Object.entries(form.plans).map(([code, plan]) => (
          <SettingsRow
            key={code}
            label={PLAN_LABELS[code]}
            description={`Code "${code}" stays the same, so payments and AI limits still match.`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id={`${code}-name`}
                label="Name"
                value={plan.name}
                onChange={input(setPlan(code, 'name'))}
                error={fieldError(`plans.${code}.name`)}
              />
              <TextField
                id={`${code}-storage`}
                label="Storage (GB)"
                type="number"
                min="1"
                value={plan.storageGB}
                onChange={input(setPlan(code, 'storageGB'))}
              />
              <TextField
                id={`${code}-monthly`}
                label="Monthly price (₹)"
                type="number"
                min="1"
                value={plan.monthlyPrice}
                onChange={input(setPlan(code, 'monthlyPrice'))}
              />
              <TextField
                id={`${code}-yearly`}
                label="Yearly price (₹)"
                type="number"
                min="1"
                placeholder={
                  plan.monthlyPrice ? `${int(plan.monthlyPrice) * 10} (10 months)` : '10 × monthly'
                }
                hint="Empty: 10 months' worth"
                value={plan.yearlyPrice}
                onChange={input(setPlan(code, 'yearlyPrice'))}
              />
              <TextField
                id={`${code}-summary`}
                label="One-line summary"
                className="sm:col-span-2"
                value={plan.summary}
                onChange={input(setPlan(code, 'summary'))}
              />
              <TextAreaField
                id={`${code}-features`}
                label="Features (one per line)"
                className="sm:col-span-2"
                rows={4}
                value={plan.features}
                onChange={input(setPlan(code, 'features'))}
              />
              <div className="sm:col-span-2">
                <Switch
                  checked={plan.highlighted}
                  onChange={setPlan(code, 'highlighted')}
                  label="Highlight this plan"
                  description="Marked “Most studios pick this”"
                />
              </div>
            </div>
          </SettingsRow>
        ))}
      </SettingsSection>

      <SettingsSection
        title="Profit guard"
        description="However the yearly offer, coupons and referral discounts combine, no plan sells for more than this much off its full price (monthly, or 12 × monthly for a year). The yearly offer must stay within it."
      >
        <SettingsRow label="Discount cap">
          <TextField
            id="max-discount"
            label="Most off, all discounts together (%)"
            type="number"
            min="0"
            max="90"
            hint="50 means a year never sells below 6 months' worth"
            value={form.pricing.maxDiscountPercent}
            onChange={input(setIn('pricing', 'maxDiscountPercent'))}
            error={fieldError('pricing.maxDiscountPercent')}
          />
        </SettingsRow>
      </SettingsSection>

      {catalog.costModel && (
        <SettingsSection
          title="Profit per plan"
          description="What one account on each plan earns you a month after storage, downloads, AI and the payment fee, for the prices above (before you save). Red loses money, amber is under 30%."
        >
          <div className="py-5">
            <PlanProfitCalculator
              plans={form.plans}
              offer={form.offer}
              maxDiscountPercent={form.pricing.maxDiscountPercent}
              model={catalog.costModel}
            />
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        title="Free plan"
        description="Every account that hasn't paid, and every paid plan once it runs out."
      >
        <SettingsRow label="Free plan">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="free-name"
              label="Name"
              value={form.free.name}
              onChange={input(setIn('free', 'name'))}
            />
            <TextField
              id="free-storage"
              label="Storage (GB)"
              type="number"
              min="0.5"
              step="0.5"
              hint="New and returning free accounts get this"
              value={form.free.storageGB}
              onChange={input(setIn('free', 'storageGB'))}
            />
            <TextField
              id="free-summary"
              label="One-line summary"
              className="sm:col-span-2"
              value={form.free.summary}
              onChange={input(setIn('free', 'summary'))}
            />
            <TextAreaField
              id="free-features"
              label="Features (one per line)"
              className="sm:col-span-2"
              rows={4}
              value={form.free.features}
              onChange={input(setIn('free', 'features'))}
            />
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Yearly offer"
        description="A percentage off every yearly plan until a date, with a countdown on the pricing pages."
      >
        <SettingsRow label="Offer">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Switch
                checked={form.offer.enabled}
                onChange={setIn('offer', 'enabled')}
                label="Offer on"
              />
            </div>
            <TextField
              id="offer-label"
              label="Label"
              value={form.offer.label}
              onChange={input(setIn('offer', 'label'))}
            />
            <TextField
              id="offer-code"
              label="Code on invoices"
              value={form.offer.code}
              onChange={input(setIn('offer', 'code'))}
            />
            <TextField
              id="offer-percent"
              label="Percent off a year"
              type="number"
              min="1"
              max="90"
              value={form.offer.percentOff}
              onChange={input(setIn('offer', 'percentOff'))}
            />
            <TextField
              id="offer-ends"
              label="Last day"
              type="date"
              value={form.offer.endsAt}
              onChange={input(setIn('offer', 'endsAt'))}
            />
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Refer & earn"
        description="A friend who signs up with someone's link and verifies their email earns that person extra storage, and gets a discount on their own first paid plan."
      >
        <SettingsRow label="Rewards">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Switch
                checked={form.referral.enabled}
                onChange={setIn('referral', 'enabled')}
                label="Referrals on"
              />
            </div>
            <TextField
              id="ref-gb"
              label="Storage per friend (GB)"
              type="number"
              min="0"
              step="0.5"
              value={form.referral.rewardGB}
              onChange={input(setIn('referral', 'rewardGB'))}
            />
            <TextField
              id="ref-limit"
              label="Friends rewarded per account"
              type="number"
              min="0"
              value={form.referral.rewardLimit}
              onChange={input(setIn('referral', 'rewardLimit'))}
            />
            <TextField
              id="ref-discount"
              label="Friend's discount (%)"
              type="number"
              min="0"
              max="90"
              value={form.referral.discountPercent}
              onChange={input(setIn('referral', 'discountPercent'))}
            />
          </div>
        </SettingsRow>
      </SettingsSection>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={save.isPending}>
          Save plans
        </Button>
        {save.isSuccess && <span className="text-success text-sm">Saved — live now</span>}
      </div>
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
    </form>
  );
}

const EMPTY_COUPON = {
  code: '',
  description: '',
  kind: 'percent',
  value: '',
  planCodes: [],
  intervals: [],
  expiresAt: '',
  maxRedemptions: '',
  perAccountLimit: '1',
  active: true,
};

function couponToForm(coupon) {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description ?? '',
    kind: coupon.percentOff ? 'percent' : 'amount',
    value: String(coupon.percentOff ?? coupon.amountOff ?? ''),
    planCodes: coupon.planCodes,
    intervals: coupon.intervals,
    expiresAt: toDateInput(coupon.expiresAt),
    maxRedemptions: coupon.maxRedemptions ? String(coupon.maxRedemptions) : '',
    perAccountLimit: String(coupon.perAccountLimit ?? 1),
    active: coupon.active,
  };
}

function Toggles({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([key, label]) => {
        const on = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((item) => item !== key) : [...value, key])}
            className={
              on
                ? 'pill-active rounded-full px-3 py-1 text-xs font-medium'
                : 'border-line text-muted hover:text-ink rounded-full border px-3 py-1 text-xs'
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function CouponDialog({ initial, onClose }) {
  const [form, setForm] = useState(initial);
  const save = useSaveCoupon();
  const set = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));
  const input = (field) => (event) => set(field)(event.target.value);

  function submit(event) {
    event.preventDefault();
    const value = int(form.value);
    save.mutate(
      {
        id: form.id,
        ...(form.id ? {} : { code: form.code.trim().toUpperCase() }),
        description: form.description.trim() || undefined,
        percentOff: form.kind === 'percent' ? value : null,
        amountOff: form.kind === 'amount' ? value : null,
        planCodes: form.planCodes,
        intervals: form.intervals,
        expiresAt: form.expiresAt ? `${form.expiresAt}T23:59:59+05:30` : null,
        maxRedemptions: int(form.maxRedemptions),
        perAccountLimit: int(form.perAccountLimit) ?? 1,
        active: form.active,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onClose={onClose} title={form.id ? `Edit ${form.code}` : 'New coupon'}>
      <form onSubmit={submit} className="space-y-4">
        {save.error && <Alert tone="error">{save.error.message}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id="coupon-code"
            label="Code"
            value={form.code}
            disabled={Boolean(form.id)}
            placeholder="DIWALI25"
            onChange={(event) => set('code')(event.target.value.toUpperCase())}
          />
          <TextField
            id="coupon-description"
            label="Note (only you see it)"
            value={form.description}
            onChange={input('description')}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Discount</p>
            <Toggles
              options={[
                ['percent', '% off'],
                ['amount', '₹ off'],
              ]}
              value={[form.kind]}
              onChange={(next) => set('kind')(next.find((item) => item !== form.kind) ?? form.kind)}
            />
          </div>
          <TextField
            id="coupon-value"
            label={form.kind === 'percent' ? 'Percent off' : 'Rupees off (before GST)'}
            type="number"
            min="1"
            max={form.kind === 'percent' ? '100' : undefined}
            value={form.value}
            onChange={input('value')}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Plans (none picked: all)</p>
          <Toggles
            options={Object.entries(PLAN_LABELS)}
            value={form.planCodes}
            onChange={set('planCodes')}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Billing (none picked: both)</p>
          <Toggles
            options={[
              ['monthly', 'Monthly'],
              ['yearly', 'Yearly'],
            ]}
            value={form.intervals}
            onChange={set('intervals')}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            id="coupon-expires"
            label="Last day"
            type="date"
            hint="Empty: no end"
            value={form.expiresAt}
            onChange={input('expiresAt')}
          />
          <TextField
            id="coupon-max"
            label="Total uses"
            type="number"
            min="1"
            hint="Empty: unlimited"
            value={form.maxRedemptions}
            onChange={input('maxRedemptions')}
          />
          <TextField
            id="coupon-per-account"
            label="Uses per account"
            type="number"
            min="1"
            value={form.perAccountLimit}
            onChange={input('perAccountLimit')}
          />
        </div>
        <Switch checked={form.active} onChange={set('active')} label="Active" />
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {form.id ? 'Save coupon' : 'Create coupon'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function couponValue(coupon) {
  return coupon.percentOff ? `${coupon.percentOff}% off` : `${formatInr(coupon.amountOff)} off`;
}

function couponLimits(coupon) {
  const parts = [
    coupon.planCodes.length ? coupon.planCodes.map((c) => PLAN_LABELS[c]).join(', ') : 'All plans',
    coupon.intervals.length ? coupon.intervals.join(' / ') : null,
    coupon.expiresAt ? `until ${shortDate(coupon.expiresAt)}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

function Coupons() {
  const { data: coupons, isPending, isError, error } = useAdminCoupons();
  const remove = useDeleteCoupon();
  const [editing, setEditing] = useState(null);

  return (
    <SettingsSection
      title="Coupons"
      description="Codes owners type at checkout. A coupon and the referral discount don't stack; the bigger one wins."
      action={
        <Button size="sm" onClick={() => setEditing(EMPTY_COUPON)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New coupon
        </Button>
      }
    >
      <div className="py-4">
        {isPending && <Skeleton className="h-24" />}
        {isError && <Alert tone="error">{error.message}</Alert>}
        {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
        {coupons?.length === 0 && (
          <p className="text-muted text-sm">
            No coupons yet. Make one for a festival or a partner.
          </p>
        )}
        {coupons?.length > 0 && (
          <ul className="divide-line/70 divide-y">
            {coupons.map((coupon) => (
              <li key={coupon.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="font-mono text-sm font-semibold">{coupon.code}</span>
                <Badge tone={coupon.active ? 'success' : 'muted'}>
                  {coupon.active ? 'Active' : 'Off'}
                </Badge>
                <span className="text-sm">{couponValue(coupon)}</span>
                <span className="text-muted min-w-0 flex-1 truncate text-xs">
                  {couponLimits(coupon)}
                  {coupon.description ? ` · ${coupon.description}` : ''}
                </span>
                <span className="text-muted text-xs tabular-nums">
                  {coupon.redemptions}
                  {coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''} used
                </span>
                <span className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${coupon.code}`}
                    onClick={() => setEditing(couponToForm(coupon))}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={
                      coupon.redemptions ? `Switch off ${coupon.code}` : `Delete ${coupon.code}`
                    }
                    title={coupon.redemptions ? 'Used before, so it is switched off' : 'Delete'}
                    loading={remove.isPending && remove.variables === coupon.id}
                    onClick={() => remove.mutate(coupon.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && <CouponDialog initial={editing} onClose={() => setEditing(null)} />}
    </SettingsSection>
  );
}

export function AdminPlansPage() {
  const { data: catalog, isPending, isError, error } = useAdminPlans();
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Plans & coupons"
        description="Prices, storage and features for every plan, the free plan, the yearly offer, referrals and coupon codes."
      />
      {isPending && <Skeleton className="h-96 w-full" />}
      {isError && <Alert tone="error">{error.message}</Alert>}
      {catalog && <CatalogForm catalog={catalog} />}
      <Coupons />
    </div>
  );
}
