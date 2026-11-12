import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as tasksService from './tasks.service.js';

function resolveAssignee(assignee, currentUserId) {
  return assignee === 'me' ? currentUserId : assignee;
}

export const list = asyncHandler(async (req, res) => {
  const { projectId, status, assignee } = req.query;
  const tasks = await tasksService.listTasks(req.workspace._id, {
    projectId,
    status,
    assigneeId: resolveAssignee(assignee, req.user._id),
  });
  sendSuccess(res, { tasks });
});

export const create = asyncHandler(async (req, res) => {
  const task = await tasksService.createTask(req.workspace._id, req.user._id, req.body);
  sendSuccess(res, { task }, { status: 201 });
});

export const update = asyncHandler(async (req, res) => {
  const task = await tasksService.updateTask(req.workspace._id, req.params.taskId, req.body);
  sendSuccess(res, { task });
});

export const remove = asyncHandler(async (req, res) => {
  await tasksService.deleteTask(req.workspace._id, req.params.taskId);
  sendSuccess(res, { deleted: true });
});
