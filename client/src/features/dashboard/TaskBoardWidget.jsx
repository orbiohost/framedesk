import { ChevronDown, CircleCheck, FolderKanban, MoreHorizontal, Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { useDismiss } from '../../lib/useDismiss.js';
import { useMoveTask } from '../tasks/hooks.js';
import { groupTasksByStatus, ORDER_STEP } from '../tasks/taskMeta.js';
import { DueChip, PriorityChip } from './TaskChips.jsx';

const TABS = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'review', label: 'Under review' },
  { value: 'done', label: 'Completed' },
];
const CARDS_SHOWN = 4;

function StatusTabs({ groups, active, onSelect, onAdd }) {
  return (
    <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
      {TABS.map((tab) => {
        const isActive = tab.value === active;
        const count = groups[tab.value].length;
        return (
          <div
            key={tab.value}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full p-1 pl-4 transition-colors',
              isActive ? 'pill-active' : 'bg-surface shadow-soft text-ink/80',
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab.value)}
              className="flex items-center gap-2 py-1 text-sm font-medium"
            >
              {tab.label}
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-center text-[11px] leading-none font-semibold tabular-nums',
                  isActive ? 'bg-surface text-ink' : 'bg-lavender text-accent dark:text-ink',
                )}
              >
                {count}
              </span>
            </button>
            {onAdd ? (
              <button
                type="button"
                onClick={() => onAdd(tab.value)}
                aria-label={`Add a task to ${tab.label}`}
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-full transition-colors',
                  isActive ? 'hover:bg-surface/15' : 'hover:bg-subtle',
                )}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : (
              <span className="w-2" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CardMenu({ task, onOpen, onMove }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(ref, isOpen, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(!isOpen);
        }}
        aria-label={`Actions for ${task.title}`}
        aria-expanded={isOpen}
        className="text-muted hover:bg-subtle hover:text-ink grid h-8 w-8 place-items-center rounded-full"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="border-line/70 bg-surface shadow-lift absolute right-0 top-full z-20 mt-1 w-44 rounded-2xl border p-1.5 text-sm">
          <button
            type="button"
            onClick={() => {
              close();
              onOpen(task);
            }}
            className="hover:bg-subtle block w-full rounded-xl px-3 py-1.5 text-left"
          >
            Open task
          </button>
          {onMove && (
            <>
              <p className="text-muted px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider">
                Move to
              </p>
              {TABS.filter((tab) => tab.value !== task.status).map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    close();
                    onMove(task, tab.value);
                  }}
                  className="hover:bg-subtle block w-full rounded-xl px-3 py-1.5 text-left"
                >
                  {tab.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, onOpen, onMove, className }) {
  const done = task.checklist.filter((item) => item.done).length;

  return (
    <article
      className={cn(
        'bg-surface shadow-soft border-line/50 hover:shadow-lift short:p-4 flex min-w-0 flex-col rounded-3xl border p-4 transition-shadow sm:p-5',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <PriorityChip priority={task.priority} />
          <DueChip task={task} />
        </div>
        <CardMenu task={task} onOpen={onOpen} onMove={onMove} />
      </div>

      <button type="button" onClick={() => onOpen(task)} className="short:mt-3 mt-4 text-left">
        <h3 className="font-display short:text-lg line-clamp-2 text-lg leading-tight sm:text-[22px]">
          {task.title}
        </h3>
        <p className="text-muted mt-2 line-clamp-2 min-h-[2.5rem] text-sm">
          {task.description || 'No details yet.'}
        </p>
      </button>

      <div className="short:mt-3 mt-4 flex min-h-9 items-center gap-2">
        {task.assignee ? (
          <>
            <Avatar name={task.assignee.name} src={task.assignee.avatarUrl} />
            <span className="text-muted truncate text-sm">{task.assignee.name}</span>
          </>
        ) : (
          <span className="text-muted text-sm">Unassigned</span>
        )}
      </div>

      <footer className="border-line/70 text-muted short:mt-3 mt-4 flex items-center gap-3 border-t pt-3 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <FolderKanban className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{task.project?.title ?? 'Personal'}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 tabular-nums">
          <CircleCheck className="h-4 w-4" aria-hidden="true" />
          {done}/{task.checklist.length}
        </span>
      </footer>
    </article>
  );
}

// The dashboard's board: one status at a time, picked from pill tabs.
export function TaskBoardWidget({
  workspace,
  tasks,
  isPending,
  canEdit,
  onOpen,
  onAdd,
  className,
}) {
  const [active, setActive] = useState('todo');
  const [showAll, setShowAll] = useState(false);
  const move = useMoveTask(workspace.id);
  const groups = groupTasksByStatus(tasks);
  const visible = groups[active];

  // Moving to another column puts the task at the end of that column.
  function moveTo(task, status) {
    const target = groups[status];
    const order = target.length ? target.at(-1).order + ORDER_STEP : ORDER_STEP;
    move.mutate({ taskId: task.id, change: { status, order } });
  }

  return (
    <section className={cn('fit:min-h-0 flex min-w-0 flex-col gap-4', className)}>
      <StatusTabs
        groups={groups}
        active={active}
        onSelect={setActive}
        onAdd={canEdit ? onAdd : null}
      />

      {move.error && <p className="text-danger px-2 text-sm">{move.error.message}</p>}

      {/* On large screens the cards scroll here and the page itself stays put. */}
      <div className="scrollbar-thin fit:-mx-1 fit:min-h-0 fit:flex-1 fit:overflow-y-auto fit:px-1 fit:pb-1 flex flex-col gap-4">
        {isPending ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-64 rounded-3xl" />
            <Skeleton className="h-64 rounded-3xl" />
          </div>
        ) : visible.length === 0 ? (
          <div className="border-line bg-surface/60 text-muted flex min-h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed p-6 text-center text-sm">
            Nothing in {TABS.find((tab) => tab.value === active).label.toLowerCase()} right now.
            {canEdit && (
              <button
                type="button"
                onClick={() => onAdd(active)}
                className="pill-active rounded-full px-4 py-2 text-sm font-medium"
              >
                Add a task
              </button>
            )}
          </div>
        ) : (
          // Phones: one swipeable row of cards. Wider screens: a two-column grid.
          <div className="scrollbar-thin -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0">
            {visible.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={onOpen}
                onMove={canEdit ? moveTo : null}
                className={cn(
                  'w-[85%] shrink-0 snap-start sm:w-auto',
                  !showAll && index >= CARDS_SHOWN && 'fit:flex sm:hidden',
                )}
              />
            ))}
          </div>
        )}

        {visible.length > CARDS_SHOWN && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-muted hover:text-ink fit:hidden hidden items-center gap-1 self-end px-2 text-sm sm:flex"
          >
            {showAll ? 'Show less' : `Show all ${visible.length}`}
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', showAll && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
    </section>
  );
}
