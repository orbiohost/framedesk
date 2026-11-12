// Readable, safe paths for files inside the backup zip:
//   files/<project title>/<folder>/<subfolder>/<file name>
//   files/Drive/<folder>/<file name>   (workspace Drive files, which have no project)

function cleanSegment(name) {
  const cleaned = String(name ?? '')
    // eslint-disable-next-line no-control-regex -- removing control characters is the point.
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.slice(0, 120) || 'untitled';
}

function withSuffix(path, attempt) {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  if (dot <= slash) return `${path} (${attempt})`;
  return `${path.slice(0, dot)} (${attempt})${path.slice(dot)}`;
}

export function createZipPathBuilder({ projects, folders }) {
  const projectTitle = new Map(projects.map((project) => [String(project._id), project.title]));
  const folderById = new Map(folders.map((folder) => [String(folder._id), folder]));
  const used = new Set();

  function folderSegments(folderId) {
    const segments = [];
    let folder = folderById.get(String(folderId));
    while (folder) {
      segments.unshift(cleanSegment(folder.name));
      folder = folderById.get(String(folder.parentId));
    }
    return segments;
  }

  // Trashed files go under "Trash" so they don't mix with live ones.
  return function pathForFile(file) {
    const location = file.deletedAt ? ['Trash'] : folderSegments(file.folderId);
    const base = [
      'files',
      file.projectId ? cleanSegment(projectTitle.get(String(file.projectId))) : 'Drive',
      ...location,
      cleanSegment(file.displayName),
    ].join('/');

    let candidate = base;
    for (let attempt = 2; used.has(candidate.toLowerCase()); attempt += 1) {
      candidate = withSuffix(base, attempt);
    }
    used.add(candidate.toLowerCase());
    return candidate;
  };
}
