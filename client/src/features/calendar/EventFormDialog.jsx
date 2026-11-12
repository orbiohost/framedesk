import { zodResolver } from '@hookform/resolvers/zod';
import { addHours, format } from 'date-fns';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import {
  fromDateInputValue,
  fromDateTimeInputValue,
  toDateInputValue,
  toDateTimeInputValue,
} from '../../lib/dates.js';
import { applyServerFieldErrors } from '../../lib/forms.js';
import { projectOptions, useProjects } from '../projects/hooks.js';
import { EVENT_TYPE_OPTIONS } from './calendarMeta.js';
import { useDeleteEvent, useSaveEvent } from './hooks.js';

const schema = z
  .object({
    title: z.string().trim().min(1, 'Give the event a title').max(200),
    type: z.string(),
    allDay: z.boolean(),
    startDay: z.string(),
    endDay: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    projectId: z.string(),
    location: z.string().max(200),
    notes: z.string().max(5000),
  })
  .refine((v) => (v.allDay ? v.startDay : v.startTime), {
    path: ['startTime'],
    message: 'Choose when it starts',
  })
  .refine((v) => (v.allDay ? v.endDay >= v.startDay : !v.endTime || v.endTime >= v.startTime), {
    path: ['endTime'],
    message: 'It must end after it starts',
  });

function defaultStart(date) {
  const start = new Date(date ?? Date.now());
  start.setHours(10, 0, 0, 0);
  return start;
}

function toFormValues(event, defaults) {
  const startsAt = event ? new Date(event.startsAt) : defaultStart(defaults.date);
  const endsAt = event ? new Date(event.endsAt) : addHours(startsAt, 1);
  return {
    title: event?.title ?? '',
    type: event?.type ?? 'shoot',
    allDay: event?.allDay ?? false,
    startDay: toDateInputValue(startsAt),
    endDay: toDateInputValue(endsAt),
    startTime: toDateTimeInputValue(startsAt),
    endTime: toDateTimeInputValue(endsAt),
    projectId: event?.project?.id ?? defaults.projectId ?? '',
    location: event?.location ?? '',
    notes: event?.notes ?? '',
  };
}

function toPayload({ allDay, startDay, endDay, startTime, endTime, ...values }) {
  const startsAt = allDay ? fromDateInputValue(startDay) : fromDateTimeInputValue(startTime);
  const endsAt = allDay
    ? fromDateInputValue(endDay || startDay)
    : (fromDateTimeInputValue(endTime) ?? startsAt);
  return { ...values, allDay, startsAt, endsAt, projectId: values.projectId || null };
}

function DeleteEventButton({ workspaceId, eventId, onDeleted }) {
  const remove = useDeleteEvent(workspaceId);
  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      loading={remove.isPending}
      onClick={() => remove.mutate(eventId, { onSuccess: onDeleted })}
    >
      Delete
    </Button>
  );
}

function EventForm({ workspaceId, event, defaults, canEdit, onDone }) {
  const save = useSaveEvent(workspaceId);
  const { data: projects } = useProjects(workspaceId);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: toFormValues(event, defaults) });
  const allDay = useWatch({ control, name: 'allDay' });

  function onSubmit(values) {
    save.mutate(
      { id: event?.id, ...toPayload(values) },
      { onSuccess: onDone, onError: (error) => applyServerFieldErrors(error, setError) },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {save.error && !save.error.details && <Alert tone="error">{save.error.message}</Alert>}
      <fieldset disabled={!canEdit} className="space-y-4">
        <TextField
          id="event-title"
          dictationWorkspaceId={workspaceId}
          label="Title"
          placeholder="e.g. Product shoot at the Bandra studio"
          autoFocus
          error={errors.title?.message}
          {...register('title')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="event-type"
            label="Type"
            options={EVENT_TYPE_OPTIONS}
            {...register('type')}
          />
          <SelectField
            id="event-project"
            label="Project"
            placeholder="Not linked to a project"
            options={projectOptions(projects)}
            {...register('projectId')}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" {...register('allDay')} /> All day
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {allDay ? (
            <>
              <TextField id="event-start-day" label="From" type="date" {...register('startDay')} />
              <TextField id="event-end-day" label="To" type="date" {...register('endDay')} />
            </>
          ) : (
            <>
              <TextField
                id="event-start"
                label="Starts"
                type="datetime-local"
                error={errors.startTime?.message}
                {...register('startTime')}
              />
              <TextField
                id="event-end"
                label="Ends"
                type="datetime-local"
                error={errors.endTime?.message}
                {...register('endTime')}
              />
            </>
          )}
        </div>
        <TextField
          id="event-location"
          label="Location"
          dictationWorkspaceId={workspaceId}
          {...register('location')}
        />
        <TextAreaField
          id="event-notes"
          label="Notes"
          rows={3}
          dictationWorkspaceId={workspaceId}
          {...register('notes')}
        />
      </fieldset>
      <DialogActions
        start={
          event &&
          canEdit && (
            <DeleteEventButton workspaceId={workspaceId} eventId={event.id} onDeleted={onDone} />
          )
        }
      >
        <Button type="button" variant="secondary" onClick={onDone}>
          {canEdit ? 'Cancel' : 'Close'}
        </Button>
        {canEdit && (
          <Button type="submit" loading={save.isPending}>
            {event ? 'Save changes' : 'Add to calendar'}
          </Button>
        )}
      </DialogActions>
    </form>
  );
}

// `defaults`: { date, projectId } to pre-fill a new event.
export function EventFormDialog({
  workspaceId,
  open,
  onClose,
  event,
  defaults = {},
  canEdit = true,
}) {
  const title = event
    ? event.title
    : `New event${defaults.date ? `, ${format(defaults.date, 'd MMM')}` : ''}`;
  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <EventForm
        workspaceId={workspaceId}
        event={event}
        defaults={defaults}
        canEdit={canEdit}
        onDone={onClose}
      />
    </Dialog>
  );
}
