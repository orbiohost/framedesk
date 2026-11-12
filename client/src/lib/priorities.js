export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function priorityLabel(value) {
  return PRIORITY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function isPressingPriority(value) {
  return value === 'high' || value === 'urgent';
}
