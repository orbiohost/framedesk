import { logger } from '../../utils/logger.js';
import { briefsRootOf } from '../files/folders.service.js';
import { ProjectBrief } from './projectBrief.model.js';

const DUPLICATE_KEY = 11000;

// The project brief's queue. Anything that changes what sits in a project's
// "Notes & Briefs" folder (an upload, a move, a trash, a finished analysis)
// calls this, and the brief worker rewrites the brief a little later.

async function markRootStale(workspaceId, root) {
  if (!root?.projectId) return;
  const filter = { workspaceId, projectId: root.projectId };
  try {
    await ProjectBrief.updateOne(
      filter,
      { $set: { staleSince: new Date(), folderId: root._id }, $setOnInsert: { status: 'queued' } },
      { upsert: true },
    );
  } catch (err) {
    // Two changes raced to create it; the other one did.
    if (err.code !== DUPLICATE_KEY) throw err;
  }
  // One being written right now picks the change up when it finishes.
  await ProjectBrief.updateOne(
    { ...filter, status: { $nin: ['generating', 'waiting'] } },
    { $set: { status: 'queued', attempts: 0, retryAt: null, error: null } },
  );
}

/**
 * Marks the brief of whichever project's briefs folder holds these folders
 * (directly or further down) as out of date. Never throws: a brief that is
 * late is better than an upload that fails.
 */
export async function markBriefStale(workspaceId, ...folderIds) {
  const unique = [...new Set(folderIds.filter(Boolean).map(String))];
  for (const folderId of unique) {
    try {
      await markRootStale(workspaceId, await briefsRootOf(workspaceId, folderId));
    } catch (err) {
      logger.warn({ err: err.message, folderId }, 'Could not mark the project brief stale');
    }
  }
}

// Whether a folder is the briefs folder or inside it.
export async function isInBriefsFolder(workspaceId, folderId) {
  return Boolean(await briefsRootOf(workspaceId, folderId).catch(() => null));
}
