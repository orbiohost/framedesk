import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as projectsService from './projects.service.js';
import { applyTaskTemplate } from './taskTemplates.js';

export const list = asyncHandler(async (req, res) => {
  const projects = await projectsService.listProjects(req.workspace._id, req.query);
  sendSuccess(res, { projects });
});

export const getOne = asyncHandler(async (req, res) => {
  const project = await projectsService.getProject(req.workspace._id, req.params.projectId);
  sendSuccess(res, { project });
});

export const create = asyncHandler(async (req, res) => {
  const project = await projectsService.createProject(req.workspace._id, req.user._id, req.body);
  sendSuccess(res, { project }, { status: 201 });
});

export const update = asyncHandler(async (req, res) => {
  const project = await projectsService.updateProject(
    req.workspace._id,
    req.params.projectId,
    req.body,
  );
  sendSuccess(res, { project });
});

export const remove = asyncHandler(async (req, res) => {
  await projectsService.deleteProject(req.workspace._id, req.params.projectId);
  sendSuccess(res, { deleted: true });
});

// Adds the project type's task list to an existing project.
export const addTaskTemplate = asyncHandler(async (req, res) => {
  const created = await applyTaskTemplate(req.workspace._id, req.user._id, req.params.projectId);
  sendSuccess(res, { created }, { status: 201 });
});
