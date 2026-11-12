import { AppError } from '../../utils/AppError.js';
import { ADMIN_ROLES } from '../members/roles.js';
import { Folder } from './folder.model.js';

// Who is asking: { userId, role }. Internal callers (the transcript worker,
// clean-up jobs) pass no viewer and see everything.
export function viewerOf(req) {
  return { userId: String(req.user._id), role: req.membership.role };
}

// Owners and admins can open every folder, so nobody can lock the studio out
// of its own files.
export function seesEveryFolder(viewer) {
  return !viewer || ADMIN_ROLES.includes(viewer.role);
}

function isOnTheList(folder, viewer) {
  return folder.allowedUserIds.some((id) => String(id) === viewer.userId);
}

// For every folder under a restriction: the restricted folders on its path
// (itself and its ancestors). To open it a viewer must be on the list of each
// one, so being let into a subfolder never opens its locked parent, and a
// locked parent hides everything inside. Folders open to the team are left out.
export function locksByFolder(folders) {
  const byId = new Map(folders.map((folder) => [String(folder._id), folder]));
  const locks = new Map();
  for (const folder of folders) {
    const path = [];
    let current = folder;
    // The path check also stops a (never expected) parent cycle from looping forever.
    while (current && !path.includes(current)) {
      path.push(current);
      current = current.parentId ? byId.get(String(current.parentId)) : null;
    }
    const lockedBy = path.filter((item) => item.access === 'restricted');
    if (lockedBy.length > 0) locks.set(String(folder._id), lockedBy);
  }
  return locks;
}

// Ids of the folders this viewer may not open: restricted folders they are not
// on the list of, and everything inside those.
export async function hiddenFolderIds(workspaceId, viewer) {
  if (seesEveryFolder(viewer)) return new Set();
  // Most workspaces restrict nothing: one cheap check, then done.
  if (!(await Folder.exists({ workspaceId, access: 'restricted' }))) return new Set();

  const folders = await Folder.find({ workspaceId })
    .select('parentId access allowedUserIds')
    .lean();
  const hidden = new Set();
  for (const [folderId, lockedBy] of locksByFolder(folders)) {
    if (lockedBy.some((folder) => !isOnTheList(folder, viewer))) hidden.add(folderId);
  }
  return hidden;
}

// A folder the viewer can't open looks exactly like one that doesn't exist.
export async function assertFolderAccess(workspaceId, folderId, viewer) {
  const hidden = await hiddenFolderIds(workspaceId, viewer);
  if (hidden.has(String(folderId))) throw AppError.notFound('Folder not found', 'FOLDER_NOT_FOUND');
}
