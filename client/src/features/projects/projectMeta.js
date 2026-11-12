export const PROJECT_TYPE_OPTIONS = [
  { value: 'video_edit', label: 'Video edit' },
  { value: 'branding', label: 'Branding' },
  { value: 'motion', label: 'Motion' },
  { value: 'social', label: 'Social' },
  { value: 'other', label: 'Other' },
];

export const PROJECT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', tone: 'muted' },
  { value: 'active', label: 'Active', tone: 'neutral' },
  { value: 'pending', label: 'Waiting on client', tone: 'neutral' },
  { value: 'review', label: 'In review', tone: 'accent' },
  { value: 'completed', label: 'Completed', tone: 'success' },
  { value: 'archived', label: 'Archived', tone: 'muted' },
];

function findOption(options, value) {
  return options.find((option) => option.value === value);
}

export function projectTypeLabel(value) {
  return findOption(PROJECT_TYPE_OPTIONS, value)?.label ?? value;
}

export function projectStatus(value) {
  return findOption(PROJECT_STATUS_OPTIONS, value) ?? { label: value, tone: 'neutral' };
}

export function isProjectOpen(project) {
  return !['completed', 'archived'].includes(project.status);
}
