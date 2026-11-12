import { Columns3, List, ListTodo, Plus } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { readLocal, writeLocal } from '../../lib/storage.js';
import { canEdit } from '../workspaces/roles.js';
import { useMoveTask, useTasks } from './hooks.js';
import { TaskBoard } from './TaskBoard.jsx';
import { TaskFormDialog } from './TaskFormDialog.jsx';
import { TaskList } from './TaskList.jsx';

const VIEW_OPTIONS = [
  { value: 'board', label: 'Board', icon: Columns3 },
  { value: 'list', label: 'List', icon: List },
];
const VIEW_STORAGE_KEY = 'taskView';

function useRememberedView() {
  const [view, setView] = useState(() => readLocal(VIEW_STORAGE_KEY) ?? 'board');
  function changeView(next) {
    setView(next);
    writeLocal(VIEW_STORAGE_KEY, next);
  }
  return [view, changeView];
}

// Shared by "My tasks" and a project's Tasks tab.
// `query` filters the list; `newTaskDefaults` pre-fills new tasks.
export function TasksPanel({ workspace, query, newTaskDefaults, showProject, emptyText }) {
  const [view, setView] = useRememberedView();
  const [dialog, setDialog] = useState(null);
  const { data: tasks, isPending, isError, error } = useTasks(workspace.id, query);
  const move = useMoveTask(workspace.id);
  const editable = canEdit(workspace);

  const openNew = () => setDialog({ task: null });
  const openTask = (task) => setDialog({ task });
  const moveTask = (task, change) => move.mutate({ taskId: task.id, change });
  const toggleDone = (task) => moveTask(task, { status: task.status === 'done' ? 'todo' : 'done' });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Task view"
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
        />
        {editable && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New task
          </Button>
        )}
      </div>

      {move.error && (
        <Alert tone="error" className="mb-4">
          {move.error.message}
        </Alert>
      )}
      {isError && <Alert tone="error">{error.message}</Alert>}
      {isPending && <Skeleton className="h-64 w-full" />}

      {tasks?.length === 0 && (
        <EmptyState
          icon={ListTodo}
          title="Nothing to do here yet"
          action={editable && <Button onClick={openNew}>Add the first task</Button>}
        >
          {emptyText}
        </EmptyState>
      )}

      {tasks?.length > 0 &&
        (view === 'board' ? (
          <TaskBoard
            tasks={tasks}
            canEdit={editable}
            showProject={showProject}
            onOpen={openTask}
            onMove={moveTask}
          />
        ) : (
          <TaskList
            tasks={tasks}
            canEdit={editable}
            showProject={showProject}
            onOpen={openTask}
            onToggleDone={toggleDone}
          />
        ))}

      <TaskFormDialog
        workspaceId={workspace.id}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        task={dialog?.task}
        defaults={newTaskDefaults}
        canEdit={editable}
      />
    </>
  );
}
