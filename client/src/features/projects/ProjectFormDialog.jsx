import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ChoiceChips } from '../../components/ui/ChoiceChips.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { MoreOptions } from '../../components/ui/MoreOptions.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { fromDateInputValue, toDateInputValue } from '../../lib/dates.js';
import { parseTagList } from '../../lib/format.js';
import { applyServerFieldErrors } from '../../lib/forms.js';
import { PRIORITY_OPTIONS } from '../../lib/priorities.js';
import { clientOptions, useClients } from '../clients/hooks.js';
import { ReminderField } from '../notifications/ReminderField.jsx';
import { useSaveProject } from './hooks.js';
import { PROJECT_STATUS_OPTIONS, PROJECT_TYPE_OPTIONS } from './projectMeta.js';

const schema = z
  .object({
    title: z.string().trim().min(1, 'Give the project a title').max(160),
    clientId: z.string(),
    type: z.string(),
    status: z.string(),
    priority: z.string(),
    startDate: z.string(),
    dueDate: z.string(),
    budget: z.string().regex(/^\d*$/, 'Whole rupees only, no commas'),
    tags: z.string().max(400),
    description: z.string().max(10000),
    reminders: z.array(z.number()).nullable(),
  })
  .refine((values) => !values.startDate || !values.dueDate || values.dueDate >= values.startDate, {
    path: ['dueDate'],
    message: 'Due date must be on or after the start date',
  });

function toFormValues(project, defaults) {
  return {
    title: project?.title ?? '',
    clientId: project?.client?.id ?? defaults.clientId ?? '',
    type: project?.type ?? 'video_edit',
    status: project?.status ?? 'active',
    priority: project?.priority ?? 'medium',
    startDate: toDateInputValue(project?.startDate),
    dueDate: toDateInputValue(project?.dueDate),
    budget: typeof project?.budget === 'number' ? String(project.budget) : '',
    tags: project?.tags.join(', ') ?? '',
    description: project?.description ?? '',
    reminders: project?.reminders ?? null,
  };
}

function toPayload(values) {
  return {
    ...values,
    clientId: values.clientId || null,
    startDate: fromDateInputValue(values.startDate),
    dueDate: fromDateInputValue(values.dueDate),
    budget: values.budget ? Number(values.budget) : null,
    tags: parseTagList(values.tags),
  };
}

function ProjectForm({ workspaceId, project, defaults, onDone }) {
  const save = useSaveProject(workspaceId);
  const { data: clients } = useClients(workspaceId);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: toFormValues(project, defaults) });
  const dueDate = useWatch({ control, name: 'dueDate' });

  function onSubmit(values) {
    save.mutate(
      { id: project?.id, ...toPayload(values) },
      { onSuccess: onDone, onError: (error) => applyServerFieldErrors(error, setError) },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {save.error && !save.error.details && <Alert tone="error">{save.error.message}</Alert>}
      <TextField
        id="project-title"
        dictationWorkspaceId={workspaceId}
        label="Title"
        hideLabel
        size="lg"
        placeholder="Project name, e.g. Diwali campaign film"
        autoFocus={!project}
        error={errors.title?.message}
        {...register('title')}
      />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <ChoiceChips
            label="Type"
            options={PROJECT_TYPE_OPTIONS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="project-client"
          label="Client"
          placeholder="No client (internal)"
          options={clientOptions(clients)}
          {...register('clientId')}
        />
        <TextField
          id="project-due"
          label="Due date"
          type="date"
          error={errors.dueDate?.message}
          {...register('dueDate')}
        />
      </div>
      {dueDate && (
        <Controller
          control={control}
          name="reminders"
          render={({ field }) => (
            <ReminderField kind="project" value={field.value} onChange={field.onChange} />
          )}
        />
      )}
      <TextAreaField
        id="project-description"
        dictationWorkspaceId={workspaceId}
        label="Brief"
        rows={3}
        placeholder="What's being delivered, formats, references…"
        error={errors.description?.message}
        {...register('description')}
      />
      {/* A new project starts Active at Medium priority; change that here if needed. */}
      <MoreOptions
        label="Status, priority, budget and tags"
        defaultOpen={Boolean(project)}
        forceOpen={Boolean(errors.budget || errors.tags || errors.startDate)}
      >
        <Controller
          control={control}
          name="priority"
          render={({ field }) => (
            <ChoiceChips
              label="Priority"
              options={PRIORITY_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="project-status"
            label="Status"
            options={PROJECT_STATUS_OPTIONS}
            {...register('status')}
          />
          <TextField
            id="project-start"
            label="Start date"
            type="date"
            error={errors.startDate?.message}
            {...register('startDate')}
          />
          <TextField
            id="project-budget"
            label="Budget (₹)"
            inputMode="numeric"
            placeholder="e.g. 75000"
            error={errors.budget?.message}
            {...register('budget')}
          />
          <TextField
            id="project-tags"
            label="Tags"
            placeholder="wedding, reels"
            hint="Separate with commas"
            error={errors.tags?.message}
            {...register('tags')}
          />
        </div>
      </MoreOptions>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {project ? 'Save changes' : 'Create project'}
        </Button>
      </DialogActions>
    </form>
  );
}

// `defaults` pre-fills a new project, e.g. { clientId } from a client's page.
export function ProjectFormDialog({ workspaceId, open, onClose, project, defaults = {} }) {
  return (
    <Dialog open={open} onClose={onClose} title={project ? 'Edit project' : 'New project'} wide>
      <ProjectForm
        workspaceId={workspaceId}
        project={project}
        defaults={defaults}
        onDone={onClose}
      />
    </Dialog>
  );
}
