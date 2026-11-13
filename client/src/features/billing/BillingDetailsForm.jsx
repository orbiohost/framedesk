import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, UserRound } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { cn } from '../../lib/cn.js';
import { applyServerFieldErrors } from '../../lib/forms.js';
import { useUpdateBillingProfile } from '../users/hooks.js';
import { GSTIN_PATTERN, STATE_OPTIONS, stateFromGstin } from './gstStates.js';

const FIELDS = [
  'companyName',
  'gstin',
  'addressLine',
  'city',
  'state',
  'postalCode',
  'country',
  'phone',
];

const text = (max) => z.string().trim().max(max, `Use at most ${max} characters`);

// `requireAddress`: checkout needs a full address (GST place of supply, invoice).
function buildSchema(requireAddress) {
  const needed = (max, message) => (requireAddress ? text(max).min(1, message) : text(max));
  return z
    .object({
      isBusiness: z.boolean(),
      companyName: text(120),
      gstin: z
        .string()
        .trim()
        .toUpperCase()
        .refine(
          (value) => value === '' || GSTIN_PATTERN.test(value),
          'Check the GSTIN: 15 characters, starting with the state code',
        ),
      addressLine: needed(200, 'Enter your address'),
      city: needed(60, 'Enter your city'),
      state: needed(60, 'Choose your state'),
      postalCode: requireAddress
        ? z
            .string()
            .trim()
            .regex(/^\d{6}$/, 'Enter the 6-digit PIN code')
        : text(12),
      country: text(60),
      phone: z
        .string()
        .trim()
        .refine(
          (value) => value === '' || /^[+\d][\d\s-]{6,19}$/.test(value),
          'Enter a valid phone number',
        ),
    })
    .superRefine((data, ctx) => {
      if (data.isBusiness && !data.companyName) {
        ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'Enter the business name' });
      }
      const gstState = stateFromGstin(data.gstin);
      if (data.isBusiness && gstState && data.state && gstState !== data.state) {
        ctx.addIssue({
          code: 'custom',
          path: ['state'],
          message: `Your GSTIN is registered in ${gstState}`,
        });
      }
    });
}

function toFormValues(profile) {
  const values = Object.fromEntries(FIELDS.map((field) => [field, profile?.[field] ?? '']));
  return {
    ...values,
    country: values.country || 'India',
    isBusiness: Boolean(profile?.companyName || profile?.gstin),
  };
}

// Switching to "Individual" clears the business fields.
function toPayload({ isBusiness, ...values }) {
  return isBusiness ? values : { ...values, companyName: '', gstin: '' };
}

function BuyerTypeToggle({ value, onChange }) {
  const options = [
    { value: false, label: 'Individual', icon: UserRound },
    { value: true, label: 'Business', icon: Building2 },
  ];
  return (
    <div role="radiogroup" aria-label="Buying as" className="grid grid-cols-2 gap-2">
      {options.map(({ value: optionValue, label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          role="radio"
          aria-checked={value === optionValue}
          onClick={() => onChange(optionValue)}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors',
            value === optionValue
              ? 'border-ink bg-subtle font-medium'
              : 'border-line text-muted hover:text-ink',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The billing address and GST details printed on invoices. Used on the
 * account page and as the first step of checkout (with `onSaved`).
 */
export function BillingDetailsForm({
  profile,
  requireAddress = false,
  submitLabel = 'Save billing details',
  onSaved,
  secondaryAction,
}) {
  const update = useUpdateBillingProfile();
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    setError,
    getValues,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(buildSchema(requireAddress)),
    defaultValues: toFormValues(profile),
  });
  const isBusiness = useWatch({ control, name: 'isBusiness' });

  function fillStateFromGstin(event) {
    const state = stateFromGstin(event.target.value.trim().toUpperCase());
    if (state && !getValues('state')) setValue('state', state, { shouldDirty: true });
  }

  function onSubmit(values) {
    // In checkout, "Continue" moves on even when nothing changed.
    if (!isDirty && onSaved) return onSaved(profile);
    update.mutate(toPayload(values), {
      onSuccess: ({ user }) => {
        reset(toFormValues(user.billingProfile));
        onSaved?.(user.billingProfile);
      },
      onError: (error) => applyServerFieldErrors(error, setError),
    });
  }

  const field = (name, label, props = {}) => (
    <TextField
      id={`billing-${name}`}
      label={label}
      error={errors[name]?.message}
      {...props}
      {...register(name)}
    />
  );
  const gstinField = register('gstin');

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {update.error && !update.error.details && <Alert tone="error">{update.error.message}</Alert>}
      <BuyerTypeToggle
        value={isBusiness}
        onChange={(value) => setValue('isBusiness', value, { shouldDirty: true })}
      />
      {isBusiness && (
        <div className="grid gap-3 sm:grid-cols-2">
          {field('companyName', 'Business name', { autoComplete: 'organization' })}
          <TextField
            id="billing-gstin"
            label="GSTIN"
            hint="Optional. Add it to claim input tax credit."
            placeholder="22AAAAA0000A1Z5"
            error={errors.gstin?.message}
            {...gstinField}
            onBlur={(event) => {
              gstinField.onBlur(event);
              fillStateFromGstin(event);
            }}
          />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {field('addressLine', 'Address', {
            autoComplete: 'street-address',
            placeholder: 'Flat, building, street',
          })}
        </div>
        {field('city', 'City', { autoComplete: 'address-level2' })}
        <SelectField
          id="billing-state"
          label="State"
          placeholder="Choose a state"
          options={STATE_OPTIONS}
          error={errors.state?.message}
          {...register('state')}
        />
        {field('postalCode', 'PIN code', { autoComplete: 'postal-code', inputMode: 'numeric' })}
        {field('country', 'Country', { autoComplete: 'country-name' })}
        <div className="sm:col-span-2">
          {field('phone', 'Phone (optional)', {
            autoComplete: 'tel',
            type: 'tel',
            placeholder: '+91 98765 43210',
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            size="sm"
            loading={update.isPending}
            disabled={!onSaved && !isDirty}
          >
            {submitLabel}
          </Button>
          {update.isSuccess && !isDirty && !onSaved && (
            <span className="text-success text-xs">Saved</span>
          )}
        </div>
        {secondaryAction}
      </div>
    </form>
  );
}

// Whether the address is complete enough to put on a tax invoice.
export function hasBillingAddress(profile) {
  return Boolean(profile?.addressLine && profile?.city && profile?.state && profile?.postalCode);
}
