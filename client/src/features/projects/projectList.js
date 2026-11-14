import { differenceInCalendarDays } from 'date-fns';
import {
  Archive,
  ArchiveRestore,
  CircleCheck,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { openAi } from '../ai/aiBridge.js';
import { formatDueLabel } from '../../lib/dates.js';
import { isProjectOpen, projectStatus, projectTypeLabel } from './projectMeta.js';

// Helpers for the Projects page: due dates, quick filters, sorting and the "⋯" menu.

const SOON_DAYS = 7;

function daysUntilDue(project) {
  return project.dueDate ? differenceInCalendarDays(new Date(project.dueDate), new Date()) : null;
}

// Still to be delivered, and late.
export function isProjectOverdue(project) {
  const days = daysUntilDue(project);
  return isProjectOpen(project) && days !== null && days < 0;
}

// Still to be delivered, due today or within the next week.
export function isProjectDueSoon(project) {
  const days = daysUntilDue(project);
  return isProjectOpen(project) && days !== null && days >= 0 && days <= SOON_DAYS;
}

// What to print for a project's due date, and how loudly.
// tone: "danger" (late) | "warning" (this week) | "muted" (no date) | "ink".
export function dueInfo(project) {
  const days = daysUntilDue(project);
  if (days === null) return { label: 'No due date', tone: 'muted' };
  const date = formatDueLabel(project.dueDate);
  if (!isProjectOpen(project)) return { label: `Due ${date}`, tone: 'muted' };
  if (days < 0) {
    return { label: `${-days} day${days === -1 ? '' : 's'} overdue`, tone: 'danger' };
  }
  if (days <= 1) return { label: `Due ${date.toLowerCase()}`, tone: 'warning' };
  if (days <= SOON_DAYS) return { label: `Due in ${days} days`, tone: 'warning' };
  return { label: `Due ${date}`, tone: 'ink' };
}

export function taskPercent(project) {
  const { done, total } = project.tasks;
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export const PROJECT_SORTS = [
  { value: 'due', label: 'Due date' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'priority', label: 'Priority' },
  { value: 'name', label: 'Name (A to Z)' },
];

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
const byName = (a, b) =>
  a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });

const COMPARATORS = {
  // Soonest first; projects without a date go last.
  due: (a, b) => {
    if (!a.dueDate || !b.dueDate) return (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1) || byName(a, b);
    return new Date(a.dueDate) - new Date(b.dueDate) || byName(a, b);
  },
  updated: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
  priority: (a, b) =>
    (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || COMPARATORS.due(a, b),
  name: byName,
};

export function sortProjects(projects, sort) {
  return [...projects].sort(COMPARATORS[sort] ?? COMPARATORS.due);
}

// Matches the title, the client, the tags, and the status and type as shown
// ("waiting", "in review", "branding").
export function matchesSearch(project, needle) {
  if (!needle) return true;
  const haystack = [
    project.title,
    project.client?.name,
    project.client?.company,
    projectStatus(project.status).label,
    projectTypeLabel(project.type),
    ...(project.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

// The "⋯" menu for one project. onAction(action, project, value?):
// "edit" | "status" (value: the new status) | "delete".
// Clicking the card opens it, so the menu only holds what changes it: finish or
// reopen, archive or restore. Other statuses are set in Edit or on the project.
// Managers can edit and change status; only owners and admins can delete.
// askAi: the AI assistant is on, so "Ask AI about this project" leads the menu.
export function projectMenuItems({ project, canManage, canDelete, onAction, askAi = false }) {
  const items = [];
  if (askAi) {
    items.push({
      key: 'ask-ai',
      label: 'Ask AI about this project',
      icon: Sparkles,
      onSelect: () => openAi({ project: { id: project.id, title: project.title } }),
    });
  }
  if (canManage) {
    const archived = project.status === 'archived';
    const completed = project.status === 'completed';
    items.push({
      key: 'edit',
      label: 'Edit details',
      icon: Pencil,
      divider: askAi,
      onSelect: () => onAction('edit', project),
    });
    if (!archived) {
      items.push({
        key: 'complete',
        label: completed ? 'Reopen project' : 'Mark as completed',
        icon: completed ? RotateCcw : CircleCheck,
        onSelect: () => onAction('status', project, completed ? 'active' : 'completed'),
      });
    }
    items.push({
      key: 'archive',
      label: archived ? 'Restore from archive' : 'Archive',
      icon: archived ? ArchiveRestore : Archive,
      onSelect: () => onAction('status', project, archived ? 'active' : 'archived'),
    });
  }
  if (canDelete) {
    items.push({
      key: 'delete',
      label: 'Delete project',
      icon: Trash2,
      danger: true,
      divider: canManage,
      onSelect: () => onAction('delete', project),
    });
  }
  return items;
}
