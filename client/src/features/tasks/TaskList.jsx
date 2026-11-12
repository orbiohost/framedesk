import { Check } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { TaskMetaLine } from './TaskMetaLine.jsx';
import { TASK_STATUS_OPTIONS, groupTasksByStatus } from './taskMeta.js';

function DoneToggle({ task, canEdit, onToggleDone }) {
  const done = task.status === 'done';
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => onToggleDone(task)}
      aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      className={cn(
        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors',
        done ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink',
      )}
    >
      {done && <Check className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}

function TaskRow({ task, showProject, canEdit, onOpen, onToggleDone }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <DoneToggle task={task} canEdit={canEdit} onToggleDone={onToggleDone} />
      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
        <p
          className={cn('text-sm font-medium', task.status === 'done' && 'text-muted line-through')}
        >
          {task.title}
        </p>
        {showProject && task.project && <p className="text-muted text-xs">{task.project.title}</p>}
        <TaskMetaLine task={task} className="mt-1" />
      </button>
    </li>
  );
}

export function TaskList({ tasks, canEdit, showProject = false, onOpen, onToggleDone }) {
  const groups = groupTasksByStatus(tasks);

  return (
    <div className="space-y-6">
      {TASK_STATUS_OPTIONS.filter(({ value }) => groups[value].length > 0).map(
        ({ value, label }) => (
          <section key={value}>
            <h3 className="text-muted mb-2 flex gap-2 text-xs font-medium uppercase tracking-[0.12em]">
              {label} <span className="tabular-nums">{groups[value].length}</span>
            </h3>
            <ul className="border-line bg-surface divide-line divide-y rounded-lg border">
              {groups[value].map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  showProject={showProject}
                  canEdit={canEdit}
                  onOpen={onOpen}
                  onToggleDone={onToggleDone}
                />
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
