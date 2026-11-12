export const TASK_STATUS_OPTIONS = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'review', label: 'In review' },
  { value: 'done', label: 'Done' },
];

export const TASK_STATUSES = TASK_STATUS_OPTIONS.map((option) => option.value);

// Must match ORDER_STEP on the server.
export const ORDER_STEP = 1024;

export function groupTasksByStatus(tasks = []) {
  const groups = Object.fromEntries(TASK_STATUSES.map((status) => [status, []]));
  for (const task of tasks) groups[task.status]?.push(task);
  for (const status of TASK_STATUSES) groups[status].sort((a, b) => a.order - b.order);
  return groups;
}

// New order for a task dropped into a column: just before `beforeTaskId`,
// or at the end when dropped on the column itself.
// `columnTasks` is the target column, sorted, without the moving task.
export function orderForDrop(columnTasks, beforeTaskId) {
  if (columnTasks.length === 0) return ORDER_STEP;

  const index = beforeTaskId ? columnTasks.findIndex((task) => task.id === beforeTaskId) : -1;
  if (index === -1) return columnTasks.at(-1).order + ORDER_STEP;

  const next = columnTasks[index].order;
  const previous = index > 0 ? columnTasks[index - 1].order : next - 2 * ORDER_STEP;
  return (previous + next) / 2;
}
