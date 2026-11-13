import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { MoreOptions } from '../../components/ui/MoreOptions.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { parseTagList } from '../../lib/format.js';
import { applyServerFieldErrors } from '../../lib/forms.js';
import { useSaveClient } from './hooks.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Client name is required').max(120),
  company: z.string().trim().max(120),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
  phone: z.string().trim().max(40),
  tags: z.string().max(400),
  notes: z.string().max(5000),
});

function toFormValues(client) {
  return {
    name: client?.name ?? '',
    company: client?.company ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    tags: client?.tags.join(', ') ?? '',
    notes: client?.notes ?? '',
  };
}

function ClientForm({ workspaceId, client, onDone }) {
  const save = useSaveClient(workspaceId);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: toFormValues(client) });

  function onSubmit(values) {
    save.mutate(
      { id: client?.id, ...values, tags: parseTagList(values.tags) },
      { onSuccess: onDone, onError: (error) => applyServerFieldErrors(error, setError) },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {save.error && !save.error.details && <Alert tone="error">{save.error.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="client-name"
          dictationWorkspaceId={workspaceId}
          label="Contact name"
          placeholder="Who you deal with"
          autoComplete="off"
          autoFocus={!client}
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          id="client-company"
          dictationWorkspaceId={workspaceId}
          label="Company"
          placeholder="Optional"
          autoComplete="off"
          error={errors.company?.message}
          {...register('company')}
        />
        <TextField
          id="client-email"
          label="Email"
          type="email"
          placeholder="Optional"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          id="client-phone"
          label="Phone"
          type="tel"
          placeholder="Optional"
          autoComplete="off"
          error={errors.phone?.message}
          {...register('phone')}
        />
      </div>
      <MoreOptions
        label="Tags and notes"
        defaultOpen={Boolean(client?.tags.length || client?.notes)}
        forceOpen={Boolean(errors.tags || errors.notes)}
      >
        <TextField
          id="client-tags"
          label="Tags"
          placeholder="wedding, retainer"
          hint="Separate with commas"
          error={errors.tags?.message}
          {...register('tags')}
        />
        <TextAreaField
          id="client-notes"
          dictationWorkspaceId={workspaceId}
          label="Notes"
          rows={3}
          placeholder="Billing contact, brand guidelines, how they like to receive files…"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </MoreOptions>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {client ? 'Save changes' : 'Add client'}
        </Button>
      </DialogActions>
    </form>
  );
}

export function ClientFormDialog({ workspaceId, open, onClose, client }) {
  return (
    <Dialog open={open} onClose={onClose} title={client ? 'Edit client' : 'New client'} wide>
      <ClientForm workspaceId={workspaceId} client={client} onDone={onClose} />
    </Dialog>
  );
}
