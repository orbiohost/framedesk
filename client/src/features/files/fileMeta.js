export const FILE_STATUS_OPTIONS = [
  { value: 'raw', label: 'Raw', tone: 'muted' },
  { value: 'in_progress', label: 'In progress', tone: 'neutral' },
  { value: 'approved', label: 'Approved', tone: 'success' },
  { value: 'final', label: 'Final', tone: 'accent' },
];

export function fileStatus(value) {
  return FILE_STATUS_OPTIONS.find((option) => option.value === value) ?? FILE_STATUS_OPTIONS[0];
}

// Sorting and filtering work on the files loaded so far (the server pages
// them newest first, 100 at a time).
export const FILE_SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A to Z)' },
  { value: 'size', label: 'Largest first' },
];

const COMPARATORS = {
  newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  size: (a, b) => b.size - a.size,
};

export function sortFiles(files, sort) {
  // "newest" is the order the server already sends.
  return sort === 'newest' ? files : [...files].sort(COMPARATORS[sort] ?? COMPARATORS.newest);
}

// "other" gathers what has no chip of its own (project files, archives...).
export const FILE_TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'video', label: 'Video' },
  { value: 'image', label: 'Images' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documents' },
  { value: 'other', label: 'Other' },
];

const NAMED_TYPES = new Set(['video', 'image', 'audio', 'document']);

export function matchesType(file, type) {
  if (type === 'all') return true;
  return type === 'other' ? !NAMED_TYPES.has(file.category) : file.category === type;
}

// The ids of a folder's ancestors, nearest first.
export function ancestorIds(folders, folderId) {
  return folderPath(folders, folderId)
    .slice(0, -1)
    .map((folder) => folder.id)
    .reverse();
}

// Flattens the folder list into tree order with a depth, for the sidebar and pickers.
export function folderTree(folders = []) {
  const childrenOf = new Map();
  for (const folder of folders) {
    const key = folder.parentId ?? 'root';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(folder);
  }

  const ordered = [];
  function visit(parentKey, depth) {
    for (const folder of childrenOf.get(parentKey) ?? []) {
      ordered.push({ ...folder, depth });
      visit(folder.id, depth + 1);
    }
  }
  visit('root', 0);
  return ordered;
}

export function folderPath(folders, folderId) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path = [];
  let current = byId.get(folderId);
  while (current) {
    path.unshift(current);
    current = byId.get(current.parentId);
  }
  return path;
}
