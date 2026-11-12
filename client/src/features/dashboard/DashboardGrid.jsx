import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  ArrowLeft,
  ArrowRight,
  Columns3,
  GripVertical,
  LayoutGrid,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { cn } from '../../lib/cn.js';
import { FocusTimer } from './FocusTimer.jsx';
import { MeetSchedule } from './MeetSchedule.jsx';
import { MiniCalendar } from './MiniCalendar.jsx';
import { MyTasksWidget } from './MyTasksWidget.jsx';
import { ProjectsWidget } from './ProjectsWidget.jsx';
import { QuickNote } from './QuickNote.jsx';
import { StatsWidget } from './StatsWidget.jsx';
import { StorageWidget } from './StorageWidget.jsx';
import { TaskBoardWidget } from './TaskBoardWidget.jsx';
import { TeamChat } from './TeamChat.jsx';
import { TeamWidget } from './TeamWidget.jsx';
import {
  DEFAULT_LAYOUT,
  SPAN_LABELS,
  WIDGETS,
  nextSpan,
  spanClasses,
  widgetById,
} from './widgetCatalog.js';

const FILL = 'h-full';

// How each widget is drawn. `ctx` carries the data and actions they share.
const RENDERERS = {
  tasks: (ctx) => (
    <TaskBoardWidget
      workspace={ctx.workspace}
      tasks={ctx.tasks}
      isPending={ctx.tasksPending}
      canEdit={ctx.editable}
      onOpen={ctx.openTask}
      onAdd={ctx.openNew}
      className={FILL}
    />
  ),
  calendar: (ctx) => <MiniCalendar workspaceId={ctx.workspace.id} className={FILL} />,
  meet: (ctx) => <MeetSchedule workspaceId={ctx.workspace.id} className={FILL} />,
  chat: (ctx) => <TeamChat workspace={ctx.workspace} className={FILL} />,
  timer: () => <FocusTimer className={FILL} />,
  notes: (ctx) => <QuickNote workspaceId={ctx.workspace.id} className={FILL} />,
  stats: (ctx) => <StatsWidget workspace={ctx.workspace} tasks={ctx.tasks} className={FILL} />,
  'my-tasks': (ctx) => (
    <MyTasksWidget
      workspace={ctx.workspace}
      canEdit={ctx.editable}
      onOpen={ctx.openTask}
      className={FILL}
    />
  ),
  projects: (ctx) => <ProjectsWidget workspace={ctx.workspace} className={FILL} />,
  team: (ctx) => <TeamWidget workspace={ctx.workspace} tasks={ctx.tasks} className={FILL} />,
  storage: (ctx) => <StorageWidget workspace={ctx.workspace} className={FILL} />,
};

function defaultSpanFor(id) {
  return DEFAULT_LAYOUT.find((item) => item.id === id)?.span ?? widgetById(id).spans.at(-1);
}

function ToolButton({ label, onClick, disabled, children, className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'hover:bg-subtle grid h-8 w-8 place-items-center rounded-full transition-colors disabled:opacity-30',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// One widget's cell. In edit mode it becomes draggable and gets a toolbar; the
// widget underneath is covered so clicks can't change data by accident.
function WidgetSlot({ item, index, count, editing, onMove, onResize, onRemove, children }) {
  const {
    setNodeRef: setDragHandle,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({ id: item.id, disabled: !editing });
  const { setNodeRef: setDropTarget, isOver } = useDroppable({ id: item.id, disabled: !editing });
  const widget = widgetById(item.id);

  return (
    <div
      ref={setDropTarget}
      className={cn(
        'fit:min-h-0 relative flex min-w-0 flex-col [&>*]:flex-1',
        spanClasses(item.id, item.span),
        isDragging && 'opacity-40',
      )}
    >
      {children}

      {editing && (
        <div
          className={cn(
            'bg-surface/75 absolute inset-0 z-10 rounded-[28px] border-2 border-dashed backdrop-blur-[2px] transition-colors',
            isOver && !isDragging ? 'border-accent bg-lavender/50' : 'border-accent/40',
          )}
        >
          <div className="bg-surface shadow-lift absolute left-2 right-2 top-2 flex items-center gap-1 rounded-full p-1">
            <button
              ref={setDragHandle}
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Drag ${widget.title}`}
              title="Drag to move"
              className="hover:bg-subtle grid h-8 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-full active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">
              {widget.title}
            </span>
            <ToolButton
              label="Move earlier"
              onClick={() => onMove(index, index - 1)}
              disabled={index === 0}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label="Move later"
              onClick={() => onMove(index, index + 1)}
              disabled={index === count - 1}
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            {widget.spans.length > 1 && (
              <button
                type="button"
                onClick={() => onResize(item.id)}
                title="Change width"
                className="hover:bg-subtle hidden h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium xl:flex"
              >
                <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
                {SPAN_LABELS[item.span]}
              </button>
            )}
            <ToolButton
              label={`Remove ${widget.title}`}
              onClick={() => onRemove(item.id)}
              className="hover:bg-pink hover:text-danger"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
          </div>
        </div>
      )}
    </div>
  );
}

function AddWidgetDialog({ open, onClose, shownIds, onAdd }) {
  const hidden = WIDGETS.filter((widget) => !shownIds.has(widget.id));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a widget"
      description="Pick what you want on your dashboard. Only you see your layout."
      wide
    >
      {hidden.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">
          Every widget is already on your dashboard.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {hidden.map((widget) => {
            const Icon = widget.icon;
            return (
              <li
                key={widget.id}
                className="border-line/70 flex items-start gap-3 rounded-2xl border p-3"
              >
                <span className="bg-lavender text-ink grid h-10 w-10 shrink-0 place-items-center rounded-full">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{widget.title}</p>
                  <p className="text-muted mt-0.5 text-xs">{widget.description}</p>
                </div>
                <Button size="sm" onClick={() => onAdd(widget.id)}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

export function EditBar({ onAdd, onReset, onDone, canReset, error }) {
  return (
    <div className="bg-surface shadow-soft border-accent/30 mb-4 flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center">
      <LayoutGrid className="text-accent hidden h-5 w-5 shrink-0 sm:block" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Customising your dashboard.</span>{' '}
        <span className="text-muted">
          Drag the handle to move a widget, change its width, or remove it.
        </span>
        {error && <span className="text-danger ml-2">{error}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add widget
        </Button>
        {canReset && (
          <Button size="sm" variant="ghost" onClick={onReset}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset
          </Button>
        )}
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function DashboardGrid({ widgets, editing, onChange, ctx, adding, setAdding }) {
  const [draggingId, setDraggingId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function move(from, to) {
    if (to < 0 || to >= widgets.length || from === to) return;
    const next = [...widgets];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function resize(id) {
    onChange(
      widgets.map((item) => (item.id === id ? { id, span: nextSpan(id, item.span) } : item)),
    );
  }

  function remove(id) {
    onChange(widgets.filter((item) => item.id !== id));
  }

  function add(id) {
    onChange([...widgets, { id, span: defaultSpanFor(id) }]);
  }

  function onDragEnd({ active, over }) {
    setDraggingId(null);
    if (!over || active.id === over.id) return;
    move(
      widgets.findIndex((item) => item.id === active.id),
      widgets.findIndex((item) => item.id === over.id),
    );
  }

  const shownIds = new Set(widgets.map((item) => item.id));
  const dragging = draggingId && widgetById(draggingId);

  return (
    <>
      {widgets.length === 0 ? (
        <div className="border-line bg-surface/60 flex flex-col items-center gap-3 rounded-3xl border border-dashed px-6 py-16 text-center">
          <p className="font-display text-xl">Your dashboard is empty</p>
          <p className="text-muted max-w-sm text-sm">
            Add the widgets you use most: tasks, calendar, chat, notes and more.
          </p>
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add widget
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setDraggingId(active.id)}
          onDragCancel={() => setDraggingId(null)}
          onDragEnd={onDragEnd}
        >
          {/* Fit-to-screen: four quarter-height rows fill the window; tall widgets
              take two. Extra rows scroll inside the dashboard, not the page. */}
          <div className="short:gap-3 scrollbar-thin fit:min-h-0 fit:flex-1 fit:overflow-y-auto fit:auto-rows-[calc((100%-3rem)/4)] fit:-mx-1 fit:px-1 fit:pb-1 grid gap-4 md:grid-cols-2 xl:grid-flow-row-dense xl:grid-cols-12">
            {widgets.map((item, index) => (
              <WidgetSlot
                key={item.id}
                item={item}
                index={index}
                count={widgets.length}
                editing={editing}
                onMove={move}
                onResize={resize}
                onRemove={remove}
              >
                {RENDERERS[item.id](ctx)}
              </WidgetSlot>
            ))}
          </div>
          <DragOverlay>
            {dragging && (
              <div className="pill-active flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-2xl">
                <GripVertical className="h-4 w-4" aria-hidden="true" />
                {dragging.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <AddWidgetDialog
        open={adding}
        onClose={() => setAdding(false)}
        shownIds={shownIds}
        onAdd={add}
      />
    </>
  );
}
