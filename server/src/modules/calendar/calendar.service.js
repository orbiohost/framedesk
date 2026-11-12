import { AppError } from '../../utils/AppError.js';
import { withoutUndefined } from '../../utils/objects.js';
import { assertClientExists } from '../clients/clients.service.js';
import { assertActiveMember } from '../members/members.service.js';
import { Project } from '../projects/project.model.js';
import { assertProjectExists } from '../projects/projects.service.js';
import { Task } from '../tasks/task.model.js';
import { Event } from './event.model.js';

// The calendar feed merges three sources into one list of items:
//   kind "event"       - events people created
//   kind "project_due" - project due dates
//   kind "task_due"    - task due dates

function projectPopulate(workspaceId) {
  return { path: 'projectId', select: 'title', match: { workspaceId } };
}

function projectRef(project) {
  return project ? { id: String(project._id), title: project.title } : null;
}

export function toEventDto(event) {
  return {
    id: String(event._id),
    title: event.title,
    type: event.type,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    project: projectRef(event.projectId),
    clientId: event.clientId ? String(event.clientId) : null,
    assigneeIds: event.assigneeIds.map(String),
    location: event.location,
    notes: event.notes,
  };
}

function eventItem(event) {
  return { kind: 'event', ...toEventDto(event) };
}

function projectDueItem(project) {
  return {
    kind: 'project_due',
    id: `project-${project._id}`,
    title: project.title,
    startsAt: project.dueDate,
    endsAt: project.dueDate,
    allDay: true,
    status: project.status,
    project: projectRef(project),
  };
}

function taskDueItem(task) {
  return {
    kind: 'task_due',
    id: `task-${task._id}`,
    taskId: String(task._id),
    title: task.title,
    startsAt: task.dueDate,
    endsAt: task.dueDate,
    allDay: true,
    status: task.status,
    project: projectRef(task.projectId),
  };
}

function findEvents(workspaceId, { from, to, projectId }) {
  const filter = withoutUndefined({ workspaceId, projectId });
  // Overlap test: anything that starts before the range ends and ends after it starts.
  filter.startsAt = { $lt: to };
  filter.endsAt = { $gte: from };
  return Event.find(filter).populate(projectPopulate(workspaceId)).lean();
}

function findProjectDueDates(workspaceId, { from, to, projectId }) {
  const filter = { workspaceId, dueDate: { $gte: from, $lt: to }, status: { $ne: 'archived' } };
  if (projectId) filter._id = projectId;
  return Project.find(filter).select('title dueDate status').lean();
}

function findTaskDueDates(workspaceId, { from, to, projectId }) {
  const filter = withoutUndefined({ workspaceId, projectId });
  filter.dueDate = { $gte: from, $lt: to };
  return Task.find(filter)
    .select('title dueDate status projectId')
    .populate(projectPopulate(workspaceId))
    .lean();
}

export async function getCalendarFeed(workspaceId, range) {
  const [events, projects, tasks] = await Promise.all([
    findEvents(workspaceId, range),
    findProjectDueDates(workspaceId, range),
    findTaskDueDates(workspaceId, range),
  ]);

  const items = [
    ...events.map(eventItem),
    ...projects.map(projectDueItem),
    ...tasks.map(taskDueItem),
  ];
  return items.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

async function assertReferences(workspaceId, { projectId, clientId, assigneeIds }) {
  if (projectId) await assertProjectExists(workspaceId, projectId);
  if (clientId) await assertClientExists(workspaceId, clientId);
  for (const userId of assigneeIds ?? []) {
    await assertActiveMember(workspaceId, userId);
  }
}

async function getEvent(workspaceId, eventId) {
  const event = await Event.findOne({ _id: eventId, workspaceId })
    .populate(projectPopulate(workspaceId))
    .lean();
  if (!event) throw AppError.notFound('Event not found');
  return toEventDto(event);
}

export async function createEvent(workspaceId, userId, input) {
  await assertReferences(workspaceId, input);
  const event = await Event.create({ ...withoutUndefined(input), workspaceId, createdBy: userId });
  return getEvent(workspaceId, event._id);
}

export async function updateEvent(workspaceId, eventId, input) {
  await assertReferences(workspaceId, input);
  const event = await Event.findOneAndUpdate(
    { _id: eventId, workspaceId },
    { $set: withoutUndefined(input) },
    { new: true, runValidators: true },
  ).lean();
  if (!event) throw AppError.notFound('Event not found');
  return getEvent(workspaceId, event._id);
}

export async function deleteEvent(workspaceId, eventId) {
  const result = await Event.deleteOne({ _id: eventId, workspaceId });
  if (result.deletedCount === 0) throw AppError.notFound('Event not found');
}
