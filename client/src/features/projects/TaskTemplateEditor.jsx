import { ArrowDown, ArrowUp, Plus, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ChoiceChips } from '../../components/ui/ChoiceChips.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { PRIORITY_OPTIONS } from '../../lib/priorities.js';
import { PROJECT_TYPE_OPTIONS } from './projectMeta.js';
import { useSaveTaskTemplate, useTaskTemplates } from './projectSettingsHooks.js';

const ICON_BUTTON =
  'text-muted hover:bg-subtle hover:text-ink grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-30';
const INPUT =
  'border-line bg-surface focus:ring-accent/40 h-9 rounded-full border px-3 text-sm outline-none focus:ring-2 disabled:opacity-60';

let nextKey = 0;
function withKeys(steps) {
  return steps.map((step) => ({ ...step, key: (nextKey += 1) }));
}

function withoutKeys(steps) {
  return steps.map(({ title, daysBeforeDue, priority }) => ({
    title: title.trim(),
    daysBeforeDue,
    priority,
  }));
}

function sameSteps(a, b) {
  return JSON.stringify(withoutKeys(a)) === JSON.stringify(withoutKeys(b));
}

function whenLabel(daysBeforeDue) {
  if (daysBeforeDue === null) return 'no date';
  if (daysBeforeDue === 0) return 'on the due date';
  return `${daysBeforeDue} day${daysBeforeDue === 1 ? '' : 's'} before`;
}

function StepRow({ step, index, count, editable, onChange, onMove, onRemove }) {
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap">
      <span className="text-muted w-5 shrink-0 text-xs tabular-nums">{index + 1}.</span>
      <input
        value={step.title}
        onChange={(event) => onChange({ title: event.target.value })}
        maxLength={300}
        disabled={!editable}
        aria-label={`Task ${index + 1} title`}
        className={`${INPUT} min-w-0 flex-1 basis-40`}
      />
      <label className="text-muted flex shrink-0 items-center gap-1.5 text-xs">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={365}
          value={step.daysBeforeDue ?? ''}
          placeholder="–"
          disabled={!editable}
          onChange={(event) => {
            const raw = event.target.value;
            const days = raw === '' ? null : Math.min(365, Math.max(0, Math.round(Number(raw))));
            onChange({ daysBeforeDue: Number.isFinite(days) ? days : null });
          }}
          aria-label={`Days before the project due date for task ${index + 1}`}
          title={whenLabel(step.daysBeforeDue)}
          className={`${INPUT} w-16 px-2 text-center`}
        />
        days before
      </label>
      <select
        value={step.priority}
        disabled={!editable}
        onChange={(event) => onChange({ priority: event.target.value })}
        aria-label={`Priority for task ${index + 1}`}
        className={`${INPUT} w-28 shrink-0 cursor-pointer`}
      >
        {PRIORITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {editable && (
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            className={ICON_BUTTON}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move task ${index + 1} up`}
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={ICON_BUTTON}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move task ${index + 1} down`}
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${ICON_BUTTON} hover:text-danger`}
            onClick={onRemove}
            aria-label={`Remove task ${index + 1}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      )}
    </li>
  );
}

// One type's list being edited. The parent remounts it (key) when the type
// changes or a save comes back, so the draft starts from what the server holds.
function StepListEditor({ workspaceId, type, template, maxSteps, editable }) {
  const [draft, setDraft] = useState(() => withKeys(template.steps));
  const [newTitle, setNewTitle] = useState('');
  const save = useSaveTaskTemplate(workspaceId);
  const dirty = !sameSteps(draft, template.steps);
  const full = draft.length >= maxSteps;
  const blank = draft.some((step) => !step.title.trim());

  function update(index, change) {
    setDraft(draft.map((step, i) => (i === index ? { ...step, ...change } : step)));
  }

  function move(index, by) {
    const next = [...draft];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setDraft(next);
  }

  function add(event) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || full) return;
    const lastDays = draft.at(-1)?.daysBeforeDue ?? null;
    setDraft([...draft, ...withKeys([{ title, daysBeforeDue: lastDays, priority: 'medium' }])]);
    setNewTitle('');
  }

  return (
    <div className="space-y-3">
      <ul className="border-line/70 divide-line/60 divide-y overflow-hidden rounded-2xl border">
        {draft.map((step, index) => (
          <StepRow
            key={step.key}
            step={step}
            index={index}
            count={draft.length}
            editable={editable}
            onChange={(change) => update(index, change)}
            onMove={(by) => move(index, by)}
            onRemove={() => setDraft(draft.filter((_, i) => i !== index))}
          />
        ))}
        {draft.length === 0 && (
          <li className="text-muted px-3.5 py-3 text-sm">
            No tasks: new projects of this type start with an empty board.
          </li>
        )}
      </ul>

      {editable && (
        <>
          <form onSubmit={add} className="flex gap-2">
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              maxLength={300}
              disabled={full}
              placeholder={full ? `Up to ${maxSteps} tasks` : 'Add a task, e.g. Client review'}
              aria-label="New task title"
              className={`${INPUT} min-w-0 flex-1 px-4`}
            />
            <Button type="submit" variant="secondary" size="sm" className="h-9" disabled={full}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add
            </Button>
          </form>
          {blank && <Alert tone="error">Every task needs a title.</Alert>}
          {save.error && <Alert tone="error">{save.error.message}</Alert>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!dirty || blank}
              loading={save.isPending}
              onClick={() => save.mutate({ type, steps: withoutKeys(draft) })}
            >
              Save task list
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => setDraft(withKeys(template.steps))}>
                Cancel
              </Button>
            )}
            {template.custom && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                loading={save.isPending}
                onClick={() => save.mutate({ type, steps: null })}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Use the standard list
              </Button>
            )}
            {save.isSuccess && !dirty && <span className="text-success text-xs">Saved</span>}
          </div>
        </>
      )}
    </div>
  );
}

// Project settings → Task lists: what each type of new project starts with.
export function TaskTemplateEditor({ workspaceId, editable }) {
  const [type, setType] = useState(PROJECT_TYPE_OPTIONS[0].value);
  const { data, isPending, isError, error } = useTaskTemplates(workspaceId);

  if (isPending) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (isError) return <Alert tone="error">{error.message}</Alert>;

  const template = data.templates[type];
  return (
    <div className="space-y-4">
      <ChoiceChips
        label="Project type"
        options={PROJECT_TYPE_OPTIONS}
        value={type}
        onChange={setType}
      />
      <StepListEditor
        key={`${type}:${JSON.stringify(template)}`}
        workspaceId={workspaceId}
        type={type}
        template={template}
        maxSteps={data.maxSteps}
        editable={editable}
      />
    </div>
  );
}
