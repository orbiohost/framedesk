import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ChoiceChips } from '../../components/ui/ChoiceChips.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { DueDateField } from '../../components/ui/DueDateField.jsx';
import { MoreOptions } from '../../components/ui/MoreOptions.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { fromDateInputValue, toDateInputValue } from '../../lib/dates.js';
import { applyServerFieldErrors } from '../../lib/forms.js';
import { PRIORITY_OPTIONS } from '../../lib/priorities.js';
import { memberOptions, useMembers } from '../members/hooks.js';
import { ReminderField } from '../notifications/ReminderField.jsx';
import { projectOptions, useProjects } from '../projects/hooks.js';
import { ChecklistEditor } from './ChecklistEditor.jsx';
import { useDeleteTask, useSaveTask } from './hooks.js';
import { TASK_STATUS_OPTIONS } from './taskMeta.js';

const schema = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(300),
  description: z.string().max(10000),
  projectId: z.string(),
  assigneeId: z.string(),
  dueDate: z.string(),
  status: z.string(),
  priority: z.string(),
  checklist: z.array(z.object({ text: z.string().trim().min(1).max(300), done: z.boolean() })),
  reminders: z.array(z.number()).nullable(),
});

function toFormValues(task, defaults) {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    projectId: task?.project?.id ?? defaults.projectId ?? '',
    assigneeId: task?.assignee?.id ?? defaults.assigneeId ?? '',
    dueDate: toDateInputValue(task?.dueDate),
    status: task?.status ?? defaults.status ?? 'todo',
    priority: task?.priority ?? 'medium',
    checklist: task?.checklist.map(({ text, done }) => ({ text, done })) ?? [],
    reminders: task?.reminders ?? null,
  };
}

function toPayload(values) {
  return {
    ...values,
    projectId: values.projectId || null,
    assigneeId: values.assigneeId || null,
    dueDate: fromDateInputValue(values.dueDate),
  };
}

function DeleteTaskButton({ workspaceId, taskId, onDeleted }) {
  const remove = useDeleteTask(workspaceId);
  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      loading={remove.isPending}
      onClick={() => remove.mutate(taskId, { onSuccess: onDeleted })}
    >
      Delete
    </Button>
  );
}

function TaskForm({ workspaceId, task, defaults, canEdit, onDone }) {
  const save = useSaveTask(workspaceId);
  const { data: members } = useMembers(workspaceId);
  const { data: projects } = useProjects(workspaceId);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: toFormValues(task, defaults) });
  const dueDate = useWatch({ control, name: 'dueDate' });

  function onSubmit(values) {
    save.mutate(
      { id: task?.id, ...toPayload(values) },
      { onSuccess: onDone, onError: (error) => applyServerFieldErrors(error, setError) },
    );
  }

  const statusField = (
    <Controller
      control={control}
      name="status"
      render={({ field }) => (
        <ChoiceChips
          label="Status"
          options={TASK_STATUS_OPTIONS}
          value={field.value}
          onChange={field.onChange}
        />
      )}
    />
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {save.error && !save.error.details && <Alert tone="error">{save.error.message}</Alert>}
      <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
        <TextField
          id="task-title"
          dictationWorkspaceId={workspaceId}
          label="Task"
          hideLabel
          size="lg"
          placeholder="What needs to be done?"
          autoFocus={!task}
          error={errors.title?.message}
          {...register('title')}
        />
        {task && statusField}
        <Controller
          control={control}
          name="dueDate"
          render={({ field }) => <DueDateField value={field.value} onChange={field.onChange} />}
        />
        {dueDate && (
          <Controller
            control={control}
            name="reminders"
            render={({ field }) => (
              <ReminderField kind="task" value={field.value} onChange={field.onChange} />
            )}
          />
        )}
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
            id="task-assignee"
            label="Assignee"
            placeholder="Unassigned"
            options={memberOptions(members)}
            {...register('assigneeId')}
          />
          <SelectField
            id="task-project"
            label="Project"
            placeholder="No project (personal)"
            options={projectOptions(projects, task?.project?.id ?? defaults.projectId ?? '')}
            {...register('projectId')}
          />
        </div>
        {/* A new task only needs the fields above; an existing one shows everything. */}
        <MoreOptions
          label={task ? 'Details and checklist' : 'Details, checklist and status'}
          defaultOpen={Boolean(task)}
          forceOpen={Boolean(errors.description || errors.checklist)}
        >
          {!task && statusField}
          <TextAreaField
            id="task-description"
            dictationWorkspaceId={workspaceId}
            label="Details"
            rows={3}
            placeholder="Links, references, what done looks like…"
            error={errors.description?.message}
            {...register('description')}
          />
          <ChecklistEditor control={control} register={register} />
        </MoreOptions>
      </fieldset>
      <DialogActions
        start={
          task &&
          canEdit && (
            <DeleteTaskButton workspaceId={workspaceId} taskId={task.id} onDeleted={onDone} />
          )
        }
      >
        <Button type="button" variant="secondary" onClick={onDone}>
          {canEdit ? 'Cancel' : 'Close'}
        </Button>
        {canEdit && (
          <Button type="submit" loading={save.isPending}>
            {task ? 'Save changes' : 'Add task'}
          </Button>
        )}
      </DialogActions>
    </form>
  );
}

// `defaults` pre-fills a new task, e.g. { projectId, status, assigneeId }.
export function TaskFormDialog({
  workspaceId,
  open,
  onClose,
  task,
  defaults = {},
  canEdit = true,
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={!task ? 'New task' : canEdit ? 'Edit task' : 'Task'}
      wide
    >
      <TaskForm
        workspaceId={workspaceId}
        task={task}
        defaults={defaults}
        canEdit={canEdit}
        onDone={onClose}
      />
    </Dialog>
  );
}
