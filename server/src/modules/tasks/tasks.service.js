import { AppError } from '../../utils/AppError.js';
import { withoutUndefined } from '../../utils/objects.js';
import { assertActiveMember } from '../members/members.service.js';
import { assertProjectExists } from '../projects/projects.service.js';
import { ORDER_STEP, Task } from './task.model.js';
import { nextDueDate } from './taskRepeat.js';

function populateRefs(query, workspaceId) {
  return query
    .populate({ path: 'projectId', select: 'title', match: { workspaceId } })
    .populate({ path: 'assigneeId', select: 'name avatarUrl' });
}

function toRef(doc, label) {
  return doc ? { id: String(doc._id), [label]: doc[label] } : null;
}

export function toTaskDto(task) {
  return {
    id: String(task._id),
    title: task.title,
    description: task.description,
    project: toRef(task.projectId, 'title'),
    assignee: task.assigneeId
      ? { ...toRef(task.assigneeId, 'name'), avatarUrl: task.assigneeId.avatarUrl ?? null }
      : null,
    dueDate: task.dueDate,
    status: task.status,
    priority: task.priority,
    checklist: task.checklist.map((item) => ({
      id: String(item._id),
      text: item.text,
      done: item.done,
    })),
    order: task.order,
    reminders: task.reminders ?? null,
    repeat: task.repeat ?? null,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

async function assertReferences(workspaceId, { projectId, assigneeId }) {
  if (projectId) await assertProjectExists(workspaceId, projectId);
  if (assigneeId) await assertActiveMember(workspaceId, assigneeId);
}

async function nextOrder(workspaceId, projectId, status) {
  const last = await Task.findOne({ workspaceId, projectId: projectId ?? null, status })
    .sort({ order: -1 })
    .select('order')
    .lean();
  return (last?.order ?? 0) + ORDER_STEP;
}

function completionChange(status) {
  if (status === undefined) return {};
  return { completedAt: status === 'done' ? new Date() : null };
}

async function getTask(workspaceId, taskId) {
  const task = await populateRefs(Task.findOne({ _id: taskId, workspaceId }), workspaceId).lean();
  if (!task) throw AppError.notFound('Task not found');
  return toTaskDto(task);
}

export async function listTasks(workspaceId, { projectId, assigneeId, status }) {
  const filter = withoutUndefined({ workspaceId, projectId, assigneeId, status });
  const tasks = await populateRefs(Task.find(filter), workspaceId)
    .sort({ order: 1 })
    .limit(1000)
    .lean();
  return tasks.map(toTaskDto);
}

export async function createTask(workspaceId, userId, input) {
  await assertReferences(workspaceId, input);
  const status = input.status ?? 'todo';

  const task = await Task.create({
    ...withoutUndefined(input),
    status,
    ...completionChange(status),
    order: await nextOrder(workspaceId, input.projectId, status),
    workspaceId,
    createdBy: userId,
  });
  return getTask(workspaceId, task._id);
}

// Ticking a repeating task done makes its next copy (fresh checklist, next due
// date). The series moves to the copy and the finished task stops repeating, so
// un-ticking and re-ticking it doesn't make a second copy.
async function repeatTask(workspaceId, finished) {
  await Task.create({
    workspaceId,
    projectId: finished.projectId,
    title: finished.title,
    description: finished.description,
    assigneeId: finished.assigneeId,
    priority: finished.priority,
    checklist: finished.checklist.map(({ text }) => ({ text, done: false })),
    reminders: finished.reminders,
    repeat: finished.repeat,
    dueDate: nextDueDate(finished.dueDate, finished.repeat),
    status: 'todo',
    order: await nextOrder(workspaceId, finished.projectId, 'todo'),
    createdBy: finished.createdBy,
  });
  await Task.updateOne({ _id: finished._id, workspaceId }, { $set: { repeat: null } });
}

export async function updateTask(workspaceId, taskId, input) {
  await assertReferences(workspaceId, input);

  const update = { ...withoutUndefined(input), ...completionChange(input.status) };
  // Returns the task as it was, to tell whether this update is what finished it.
  const before = await Task.findOneAndUpdate(
    { _id: taskId, workspaceId },
    { $set: update },
    { new: false, runValidators: true },
  ).lean();
  if (!before) throw AppError.notFound('Task not found');

  const repeat = input.repeat !== undefined ? input.repeat : before.repeat;
  if (input.status === 'done' && before.status !== 'done' && repeat) {
    await repeatTask(workspaceId, { ...before, ...update, repeat });
  }
  return getTask(workspaceId, before._id);
}

export async function deleteTask(workspaceId, taskId) {
  const result = await Task.deleteOne({ _id: taskId, workspaceId });
  if (result.deletedCount === 0) throw AppError.notFound('Task not found');
}
