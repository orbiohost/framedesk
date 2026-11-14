import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useState } from 'react';
import { cn } from '../../lib/cn.js';
import { TaskMetaLine } from './TaskMetaLine.jsx';
import { TASK_STATUS_OPTIONS, groupTasksByStatus, orderForDrop } from './taskMeta.js';

// Prefer dropping onto a card (insert before it); otherwise onto the column (append).
function cardFirstCollision(args) {
  const hits = pointerWithin(args);
  const candidates = hits.length > 0 ? hits : rectIntersection(args);
  const cardHit = candidates.find(
    (hit) => hit.data?.droppableContainer?.data.current?.type === 'card',
  );
  return cardHit ? [cardHit] : candidates;
}

function TaskCardBody({ task, showProject }) {
  return (
    <>
      {showProject && task.project && (
        <p className="text-muted mb-1 truncate text-[11px] uppercase tracking-[0.1em]">
          {task.project.title}
        </p>
      )}
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      <TaskMetaLine task={task} className="mt-2" />
    </>
  );
}

function DraggableCard({ task, showProject, canEdit, onOpen }) {
  const drag = useDraggable({ id: task.id, disabled: !canEdit });
  const drop = useDroppable({ id: `card-${task.id}`, data: { type: 'card', task } });

  function setRefs(node) {
    drag.setNodeRef(node);
    drop.setNodeRef(node);
  }

  return (
    <li
      ref={setRefs}
      {...drag.attributes}
      {...drag.listeners}
      className={cn(
        'border-line bg-surface rounded-md border p-3 shadow-sm transition-opacity',
        canEdit && 'cursor-grab touch-none active:cursor-grabbing',
        drag.isDragging && 'opacity-40',
        drop.isOver && !drag.isDragging && 'ring-accent/50 ring-2',
      )}
    >
      <button type="button" onClick={() => onOpen(task)} className="block w-full text-left">
        <TaskCardBody task={task} showProject={showProject} />
      </button>
    </li>
  );
}

function Column({ status, label, tasks, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: 'column', status },
  });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        'bg-subtle/60 flex w-72 shrink-0 flex-col rounded-lg p-2 md:w-auto',
        isOver && 'bg-subtle',
      )}
    >
      <h3 className="text-muted flex items-center justify-between px-1.5 pb-2 pt-1 text-xs font-medium uppercase tracking-[0.12em]">
        {label}
        <span className="tabular-nums">{tasks.length}</span>
      </h3>
      <ul className="flex min-h-24 flex-1 flex-col gap-2">{children}</ul>
    </section>
  );
}

function dropTarget(over) {
  const data = over.data.current;
  if (data?.type === 'card') return { status: data.task.status, beforeTaskId: data.task.id };
  return { status: data?.status, beforeTaskId: null };
}

export function TaskBoard({ tasks, canEdit, showProject = false, onOpen, onMove }) {
  const [activeTask, setActiveTask] = useState(null);
  const columns = groupTasksByStatus(tasks);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd({ active, over }) {
    setActiveTask(null);
    if (!over) return;

    const task = tasks.find((candidate) => candidate.id === active.id);
    const { status, beforeTaskId } = dropTarget(over);
    if (!task || !status || beforeTaskId === task.id) return;

    const columnTasks = columns[status].filter((candidate) => candidate.id !== task.id);
    const order = orderForDrop(columnTasks, beforeTaskId);
    if (status === task.status && order === task.order) return;
    onMove(task, { status, order });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={cardFirstCollision}
      onDragStart={({ active }) => setActiveTask(tasks.find((task) => task.id === active.id))}
      onDragCancel={() => setActiveTask(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-2 sm:-mx-4 sm:px-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {TASK_STATUS_OPTIONS.map(({ value, label }) => (
          <Column key={value} status={value} label={label} tasks={columns[value]}>
            {columns[value].map((task) => (
              <DraggableCard
                key={task.id}
                task={task}
                showProject={showProject}
                canEdit={canEdit}
                onOpen={onOpen}
              />
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="border-line bg-surface w-72 rotate-1 rounded-md border p-3 shadow-xl">
            <TaskCardBody task={activeTask} showProject={showProject} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
