import { zodResolver } from '@hookform/resolvers/zod';
import { addHours, format } from 'date-fns';
import { useState } from 'react';
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
import {
  fromDateInputValue,
  fromDateTimeInputValue,
  toDateInputValue,
  toDateTimeInputValue,
} from '../../lib/dates.js';
import { applyServerFieldErrors } from '../../lib/forms.js';
import { ReminderField } from '../notifications/ReminderField.jsx';
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
    reminders: z.array(z.number()).nullable(),
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
    reminders: event?.reminders ?? null,
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
    getValues,
    setValue,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: toFormValues(event, defaults) });
  const allDay = useWatch({ control, name: 'allDay' });
  const [previousStart, setPreviousStart] = useState(() => getValues('startTime'));

  // Moving the start moves the end with it, so the event keeps its length.
  function keepDuration(changeEvent) {
    const start = changeEvent.target.value;
    setPreviousStart(start);
    const end = getValues('endTime');
    if (!start || !previousStart || !end) return;
    const duration = new Date(end) - new Date(previousStart);
    if (duration < 0) return;
    setValue('endTime', toDateTimeInputValue(new Date(new Date(start).getTime() + duration)));
  }

  function keepEndDayAfterStart(changeEvent) {
    const startDay = changeEvent.target.value;
    if (startDay && getValues('endDay') < startDay) setValue('endDay', startDay);
  }

  function onSubmit(values) {
    save.mutate(
      { id: event?.id, ...toPayload(values) },
      { onSuccess: onDone, onError: (error) => applyServerFieldErrors(error, setError) },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {save.error && !save.error.details && <Alert tone="error">{save.error.message}</Alert>}
      <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
        <TextField
          id="event-title"
          dictationWorkspaceId={workspaceId}
          label="Title"
          hideLabel
          size="lg"
          placeholder="What's happening? e.g. Product shoot"
          autoFocus={!event}
          error={errors.title?.message}
          {...register('title')}
        />
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <ChoiceChips
              label="Type"
              options={EVENT_TYPE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {allDay ? (
            <>
              <TextField
                id="event-start-day"
                label="From"
                type="date"
                {...register('startDay', { onChange: keepEndDayAfterStart })}
              />
              <TextField
                id="event-end-day"
                label="To"
                type="date"
                error={errors.endTime?.message}
                {...register('endDay')}
              />
            </>
          ) : (
            <>
              <TextField
                id="event-start"
                label="Starts"
                type="datetime-local"
                error={errors.startTime?.message}
                {...register('startTime', { onChange: keepDuration })}
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
          <label className="inline-flex w-fit cursor-pointer items-center gap-2.5 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="peer sr-only"
              // Minutes before a start time mean something else for a whole
              // day, so a custom choice goes back to the default.
              {...register('allDay', { onChange: () => setValue('reminders', null) })}
            />
            <span
              aria-hidden="true"
              className="bg-line peer-checked:bg-accent peer-focus-visible:ring-accent/40 relative h-5 w-9 shrink-0 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:ring-[3px]"
            />
            All day
          </label>
        </div>
        <Controller
          control={control}
          name="reminders"
          render={({ field }) => (
            <ReminderField
              kind={allDay ? 'allDayEvent' : 'event'}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <MoreOptions
          label="Project, location and notes"
          defaultOpen={Boolean(event?.project || event?.location || event?.notes)}
          forceOpen={Boolean(errors.location || errors.notes)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="event-project"
              label="Project"
              placeholder="Not linked"
              options={projectOptions(projects, event?.project?.id ?? defaults.projectId ?? '')}
              {...register('projectId')}
            />
            <TextField
              id="event-location"
              label="Location"
              placeholder="Studio, address or call link"
              dictationWorkspaceId={workspaceId}
              error={errors.location?.message}
              {...register('location')}
            />
          </div>
          <TextAreaField
            id="event-notes"
            label="Notes"
            rows={3}
            dictationWorkspaceId={workspaceId}
            error={errors.notes?.message}
            {...register('notes')}
          />
        </MoreOptions>
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
    ? canEdit
      ? 'Edit event'
      : 'Event'
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
