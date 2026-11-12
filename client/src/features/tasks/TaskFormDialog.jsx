import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { fromDateInputValue, toDateInputValue } from '../../lib/dates.js';
import { applyServerFieldErrors } from '../../lib/forms.js';
import { PRIORITY_OPTIONS } from '../../lib/priorities.js';
import { memberOptions, useMembers } from '../members/hooks.js';
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

  function onSubmit(values) {
    save.mutate(
      { id: task?.id, ...toPayload(values) },
      { onSuccess: onDone, onError: (error) => applyServerFieldErrors(error, setError) },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {save.error && !save.error.details && <Alert tone="error">{save.error.message}</Alert>}
      <fieldset disabled={!canEdit} className="space-y-4">
        <TextField
          id="task-title"
          dictationWorkspaceId={workspaceId}
          label="Task"
          placeholder="e.g. Rough cut of the sangeet highlights"
          autoFocus
          error={errors.title?.message}
          {...register('title')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="task-project"
            label="Project"
            placeholder="No project (personal)"
            options={projectOptions(projects)}
            {...register('projectId')}
          />
          <SelectField
            id="task-assignee"
            label="Assignee"
            placeholder="Unassigned"
            options={memberOptions(members)}
            {...register('assigneeId')}
          />
          <SelectField
            id="task-status"
            label="Status"
            options={TASK_STATUS_OPTIONS}
            {...register('status')}
          />
          <SelectField
            id="task-priority"
            label="Priority"
            options={PRIORITY_OPTIONS}
            {...register('priority')}
          />
          <TextField id="task-due" label="Due date" type="date" {...register('dueDate')} />
        </div>
        <TextAreaField
          id="task-description"
          dictationWorkspaceId={workspaceId}
          label="Details"
          rows={3}
          {...register('description')}
        />
        <ChecklistEditor control={control} register={register} />
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
    <Dialog open={open} onClose={onClose} title={task ? task.title : 'New task'} wide>
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
