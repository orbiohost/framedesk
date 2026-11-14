import { zodResolver } from '@hookform/resolvers/zod';
import { Check, CircleAlert, CircleCheck, Copy, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { SettingsRow, SettingsSection } from '../../features/account/SettingsSection.jsx';
import {
  useBillingSettings,
  useSampleInvoice,
  useUpdateBillingSettings,
} from '../../features/admin/hooks.js';
import { dateTime } from '../../features/admin/adminFormat.js';
import { GSTIN_PATTERN, STATE_OPTIONS, stateFromGstin } from '../../features/billing/gstStates.js';
import { applyServerFieldErrors } from '../../lib/forms.js';

const RATE_OPTIONS = [0, 5, 12, 18, 28].map((rate) => ({ value: String(rate), label: `${rate}%` }));

const text = (max) => z.string().trim().max(max, `Use at most ${max} characters`);

const schema = z
  .object({
    businessName: z.string().trim().min(1, 'Enter your business name').max(120),
    addressLine: text(200),
    city: text(60),
    state: text(60),
    postalCode: text(12),
    country: text(60),
    email: z
      .string()
      .trim()
      .refine((value) => value === '' || z.email().safeParse(value).success, 'Enter a valid email'),
    phone: text(20),
    gstEnabled: z.boolean(),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === '' || GSTIN_PATTERN.test(value), 'Check the GSTIN'),
    gstRate: z.string(),
    sacCode: z
      .string()
      .trim()
      .refine((value) => value === '' || /^\d{4,8}$/.test(value), 'SAC codes are 4 to 8 digits'),
    invoicePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,5}$/, 'Use 1 to 5 letters or digits'),
    footerNote: text(240),
  })
  .refine((data) => !data.gstEnabled || data.gstin, {
    path: ['gstin'],
    message: 'Add your GSTIN to charge GST',
  });

function toFormValues(settings) {
  return {
    businessName: settings.businessName ?? '',
    addressLine: settings.addressLine ?? '',
    city: settings.city ?? '',
    state: settings.state ?? '',
    postalCode: settings.postalCode ?? '',
    country: settings.country ?? 'India',
    email: settings.email ?? '',
    phone: settings.phone ?? '',
    gstEnabled: Boolean(settings.gstEnabled),
    gstin: settings.gstin ?? '',
    gstRate: String(settings.gstRate ?? 18),
    sacCode: settings.sacCode ?? '',
    invoicePrefix: settings.invoicePrefix ?? 'FD',
    footerNote: settings.footerNote ?? '',
  };
}

function toPayload(values) {
  return { ...values, gstRate: Number(values.gstRate) };
}

function StatusLine({ ok, children }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <p className={`flex items-center gap-2 text-sm ${ok ? 'text-success' : 'text-warning'}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-ink">{children}</span>
    </p>
  );
}

function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="border-line bg-subtle/50 flex h-10 items-center gap-2 rounded-xl border pl-3.5 pr-1">
      <code className="min-w-0 flex-1 truncate text-xs" title={value}>
        {value}
      </code>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy webhook URL'}
        title={copied ? 'Copied' : 'Copy'}
        className={copied ? 'text-success enabled:hover:text-success' : undefined}
      >
        {copied ? (
          <Check className="h-4 w-4 animate-[pop-in_180ms_ease-out]" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

function RazorpayStatus({ razorpay }) {
  return (
    <SettingsSection
      title="Online payments"
      description="Razorpay keys live in the server's .env file, so they never pass through this page."
      action={
        razorpay.mode && (
          <Badge tone={razorpay.mode === 'live' ? 'success' : 'accent'}>
            {razorpay.mode === 'live' ? 'Live mode' : 'Test mode'}
          </Badge>
        )
      }
    >
      <SettingsRow label="API keys" description="RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET">
        {razorpay.configured ? (
          <StatusLine ok>
            Connected <span className="text-muted">· {razorpay.keyIdHint}</span>
          </StatusLine>
        ) : (
          <StatusLine ok={false}>
            Not set. Customers get the &ldquo;we&apos;ll send a payment link&rdquo; flow instead.
          </StatusLine>
        )}
      </SettingsRow>
      <SettingsRow
        label="Webhook"
        description="Add this URL in Razorpay → Webhooks with the events payment.captured, order.paid and payment.failed."
      >
        <div className="space-y-2">
          <CopyField value={razorpay.webhookUrl} />
          <StatusLine ok={razorpay.webhookConfigured}>
            {razorpay.webhookConfigured
              ? 'Webhook secret set (RAZORPAY_WEBHOOK_SECRET)'
              : 'Webhook secret not set. Payments still work, but a closed browser tab can delay activation.'}
          </StatusLine>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}

function SettingsForm({ data }) {
  const update = useUpdateBillingSettings();
  const sample = useSampleInvoice();
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm({ resolver: zodResolver(schema), defaultValues: toFormValues(data.settings) });

  const [gstEnabled, gstin, state, rawPrefix] = useWatch({
    control,
    name: ['gstEnabled', 'gstin', 'state', 'invoicePrefix'],
  });
  const prefix = (rawPrefix || '').toUpperCase();
  // When the last save finished; the save bar says so for a moment.
  const [savedAt, setSavedAt] = useState(null);
  useEffect(() => {
    if (!savedAt) return undefined;
    const timer = setTimeout(() => setSavedAt(null), 2500);
    return () => clearTimeout(timer);
  }, [savedAt]);
  const justSaved = savedAt !== null;
  const gstState = stateFromGstin(gstin?.toUpperCase());
  const nextNumber = data.nextInvoiceNumber.replace(/^[^/]+/, prefix || '…');

  function onSubmit(values) {
    update.mutate(toPayload(values), {
      onSuccess: (saved) => {
        reset(toFormValues(saved.settings));
        setSavedAt(Date.now());
      },
      onError: (error) => applyServerFieldErrors(error, setError),
    });
  }

  function openSample() {
    const target = window.open('', '_blank');
    sample.mutate(target);
  }

  const field = (name, label, props = {}) => (
    <TextField
      id={`inv-${name}`}
      label={label}
      error={errors[name]?.message}
      {...props}
      {...register(name)}
    />
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {data.settings.source === 'environment' && (
        <Alert tone="info">
          These values come from the server&apos;s .env file. Save once to manage them here from now
          on.
        </Alert>
      )}
      {update.error && !update.error.details && <Alert tone="error">{update.error.message}</Alert>}
      {sample.error && <Alert tone="error">{sample.error.message}</Alert>}

      <SettingsSection
        title="Business details"
        description="The seller block at the top of every invoice."
        action={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={openSample}
            loading={sample.isPending}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Sample invoice
          </Button>
        }
      >
        <SettingsRow label="Name" description="Your registered business or trade name.">
          {field('businessName', 'Business name', { autoComplete: 'organization' })}
        </SettingsRow>
        <SettingsRow label="Address" description="As registered for GST.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">{field('addressLine', 'Street address')}</div>
            {field('city', 'City')}
            <SelectField
              id="inv-state"
              label="State"
              placeholder="Choose a state"
              options={STATE_OPTIONS}
              error={errors.state?.message}
              {...register('state')}
            />
            {field('postalCode', 'PIN code', { inputMode: 'numeric' })}
            {field('country', 'Country')}
          </div>
        </SettingsRow>
        <SettingsRow
          label="Contact"
          description="Shown so customers know where to ask about a bill."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {field('email', 'Billing email', { type: 'email' })}
            {field('phone', 'Phone', { type: 'tel' })}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="GST" description="How tax is worked out and printed.">
        <SettingsRow
          label="Charge GST"
          description="Adds GST on top of plan prices at checkout and turns invoices into tax invoices."
          align="center"
        >
          <Switch
            checked={gstEnabled}
            onChange={(value) => setValue('gstEnabled', value, { shouldDirty: true })}
            label={gstEnabled ? 'On' : 'Off'}
            description={gstEnabled ? 'invoices are tax invoices' : 'no GST is added'}
          />
        </SettingsRow>
        <SettingsRow
          label="Registration"
          description="Buyers in your GSTIN's state pay CGST + SGST; everyone else pays IGST."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              {field('gstin', 'GSTIN', {
                placeholder: '29ABCDE1234F1Z5',
                hint: gstState ? `Registered in ${gstState}` : undefined,
              })}
            </div>
            <SelectField
              id="inv-gstRate"
              label="Rate"
              options={RATE_OPTIONS}
              error={errors.gstRate?.message}
              {...register('gstRate')}
            />
            {field('sacCode', 'SAC code (optional)', {
              inputMode: 'numeric',
              placeholder: '998314',
            })}
          </div>
          {gstState && state && gstState !== state && (
            <Alert tone="info" className="mt-3">
              Your address is in {state} but the GSTIN is registered in {gstState}. Tax is split by
              the GSTIN&apos;s state.
            </Alert>
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Invoices" description="Numbering and the note at the bottom.">
        <SettingsRow
          label="Number format"
          description="Numbers run in sequence and restart each financial year (April), as GST requires."
        >
          <div className="grid items-start gap-3 sm:grid-cols-2">
            {field('invoicePrefix', 'Prefix', { maxLength: 5 })}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Next invoice</p>
              <p className="border-line bg-subtle/50 flex h-10 items-center rounded-xl border px-3.5 font-mono text-sm">
                {nextNumber}
              </p>
            </div>
          </div>
        </SettingsRow>
        <SettingsRow label="Footer note" description="Replaces “Thank you for choosing …”.">
          <TextAreaField
            id="inv-footerNote"
            label="Note"
            rows={2}
            placeholder="Thank you for your business. Payment terms: due on receipt."
            error={errors.footerNote?.message}
            {...register('footerNote')}
          />
        </SettingsRow>
      </SettingsSection>

      <RazorpayStatus razorpay={data.razorpay} />

      <p className="text-muted text-xs">
        {data.settings.updatedAt
          ? `Last saved ${dateTime(data.settings.updatedAt)}.`
          : 'Not saved yet.'}{' '}
        Changes apply to new invoices; ones already issued keep their details.
      </p>

      {(isDirty || justSaved) && (
        // Sticks to the bottom of the window while the form scrolls, inside the content column.
        <div className="sticky bottom-4 z-20 flex justify-center">
          <div
            role="status"
            className="bg-surface/95 border-line shadow-lift flex h-12 animate-[rise-in_200ms_ease-out] items-center gap-2 rounded-full border pl-5 pr-1.5 backdrop-blur"
          >
            {isDirty ? (
              <>
                <span className="bg-warning h-2 w-2 rounded-full" aria-hidden="true" />
                <span className="mr-2 text-sm font-medium">Unsaved changes</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => reset()}
                  disabled={update.isPending}
                >
                  Discard
                </Button>
                <Button type="submit" size="sm" loading={update.isPending}>
                  Save changes
                </Button>
              </>
            ) : (
              <span className="text-success flex items-center gap-2 pr-3.5 text-sm font-medium">
                <CircleCheck className="h-4 w-4" aria-hidden="true" />
                All changes saved
              </span>
            )}
          </div>
        </div>
      )}
    </form>
  );
}

export function AdminInvoicingPage() {
  const { data, isPending, isError, error } = useBillingSettings();
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Invoicing"
        description="Your business details, GST and invoice numbering, used on every customer invoice."
      />
      {isError && <Alert tone="error">{error.message}</Alert>}
      {isPending ? <Skeleton className="h-96 w-full" /> : data && <SettingsForm data={data} />}
    </div>
  );
}
