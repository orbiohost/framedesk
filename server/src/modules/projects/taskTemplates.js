import { addDays } from '../../utils/calendarDates.js';
import { AppError } from '../../utils/AppError.js';
import { ORDER_STEP, Task } from '../tasks/task.model.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { Project, PROJECT_TYPES } from './project.model.js';

// The task list a new project starts with, one per project type. A step's
// `daysBeforeDue` dates it back from the project's due date (0 = on the due date,
// null = no date). A workspace can replace any type's list in Project settings.

export const MAX_TEMPLATE_STEPS = 40;

function steps(list) {
  return list.map(([title, daysBeforeDue, priority = 'medium']) => ({
    title,
    daysBeforeDue,
    priority,
  }));
}

export const BUILT_IN_TASK_TEMPLATES = {
  video_edit: steps([
    ['Collect raw footage and assets', 14],
    ['Organise and sync footage', 12],
    ['Pull selects', 11],
    ['Rough cut', 9, 'high'],
    ['Client review: rough cut', 7],
    ['Apply client changes', 5],
    ['Colour grade and sound mix', 3],
    ['Final export and quality check', 1, 'high'],
    ['Deliver to client', 0, 'high'],
  ]),
  branding: steps([
    ['Discovery call and brief', 21],
    ['Research and moodboard', 18],
    ['Logo concepts', 14, 'high'],
    ['Client review: concepts', 11],
    ['Refine the chosen concept', 7],
    ['Brand guidelines', 4],
    ['Export and deliver final assets', 0, 'high'],
  ]),
  motion: steps([
    ['Script and storyboard', 18],
    ['Style frames', 14],
    ['Client approval: style frames', 12],
    ['Animation', 7, 'high'],
    ['Sound design', 4],
    ['Client review', 3],
    ['Final render and delivery', 0, 'high'],
  ]),
  social: steps([
    ['Content plan', 14],
    ['Shoot or gather content', 10],
    ['Edit posts and reels', 6, 'high'],
    ['Write captions and hashtags', 4],
    ['Client approval', 3],
    ['Schedule posts', 1],
  ]),
  other: steps([
    ['Kick-off and brief', 7],
    ['Client review', 2],
    ['Final delivery', 0, 'high'],
  ]),
};

function customTemplates(workspace) {
  return workspace?.projectTaskTemplates ?? {};
}

function plainSteps(list) {
  return list.map(({ title, daysBeforeDue, priority }) => ({
    title,
    daysBeforeDue: daysBeforeDue ?? null,
    priority: priority ?? 'medium',
  }));
}

// { [type]: { steps, custom } } for every project type.
export async function taskTemplatesOf(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).select('projectTaskTemplates').lean();
  const custom = customTemplates(workspace);
  return Object.fromEntries(
    PROJECT_TYPES.map((type) => {
      const own = Array.isArray(custom[type]) ? custom[type] : null;
      return [type, { steps: plainSteps(own ?? BUILT_IN_TASK_TEMPLATES[type]), custom: !!own }];
    }),
  );
}

// steps: the type's new list ([] = no tasks), or null for the built-in one.
export async function saveTaskTemplate(workspaceId, type, list) {
  const field = `projectTaskTemplates.${type}`;
  await Workspace.updateOne(
    { _id: workspaceId },
    list ? { $set: { [field]: plainSteps(list) } } : { $unset: { [field]: 1 } },
  );
  return taskTemplatesOf(workspaceId);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// A step's date, kept inside the project: never before its start date, and
// never in the past when the project is already running late. Moving it on by
// whole days keeps it on the user's midnight, like the project's own due date.
function stepDueDate(project, daysBeforeDue, now) {
  if (!project.dueDate || daysBeforeDue === null) return null;
  const due = addDays(project.dueDate, -daysBeforeDue);
  const earliest = Math.max(project.startDate?.getTime() ?? 0, now.getTime() - DAY_MS);
  if (due.getTime() >= earliest) return due;
  const moved = addDays(due, Math.ceil((earliest - due.getTime()) / DAY_MS));
  return moved > project.dueDate ? project.dueDate : moved;
}

// Adds the project type's task list to the project, after any tasks already in
// To do. Returns how many tasks were made.
export async function applyTaskTemplate(workspaceId, userId, projectId, now = new Date()) {
  const project = await Project.findOne({ _id: projectId, workspaceId })
    .select('type startDate dueDate')
    .lean();
  if (!project) throw AppError.notFound('Project not found');

  const templates = await taskTemplatesOf(workspaceId);
  const list = templates[project.type]?.steps ?? [];
  if (list.length === 0) return 0;

  const last = await Task.findOne({ workspaceId, projectId: project._id, status: 'todo' })
    .sort({ order: -1 })
    .select('order')
    .lean();
  const firstOrder = (last?.order ?? 0) + ORDER_STEP;

  await Task.insertMany(
    list.map((item, index) => ({
      workspaceId,
      projectId: project._id,
      title: item.title,
      priority: item.priority,
      dueDate: stepDueDate(project, item.daysBeforeDue, now),
      status: 'todo',
      order: firstOrder + index * ORDER_STEP,
      createdBy: userId,
    })),
  );
  return list.length;
}
