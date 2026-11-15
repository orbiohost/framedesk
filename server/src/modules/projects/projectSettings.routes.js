import { Router } from 'express';
import { z } from 'zod';
import { canManage, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  BRIEFS_FOLDER_NAME,
  DEFAULT_FOLDERS,
  MAX_PROJECT_FOLDERS,
} from '../files/folders.service.js';
import { Workspace } from '../workspaces/workspace.model.js';

// Mounted at /workspaces/:workspaceId/project-settings: what every new project
// in the workspace starts with. Existing projects keep their folders.
const router = Router();

const folderName = z
  .string()
  .trim()
  .min(1, 'Give the folder a name')
  .max(120, 'Folder names can be up to 120 characters')
  .refine((name) => !/[/\\]/.test(name), 'Folder names cannot contain / or \\');

const updateSchema = z.object({
  // null goes back to the built-in list.
  folders: z
    .array(folderName)
    .max(MAX_PROJECT_FOLDERS, `Up to ${MAX_PROJECT_FOLDERS} folders`)
    .nullable(),
});

function settingsOf(workspace) {
  const custom = Array.isArray(workspace.projectFolders);
  return {
    folders: custom ? workspace.projectFolders : DEFAULT_FOLDERS,
    custom,
    builtIn: DEFAULT_FOLDERS,
    // Always made, whatever the list says (it feeds the AI brief).
    alwaysIncluded: [BRIEFS_FOLDER_NAME],
    maxFolders: MAX_PROJECT_FOLDERS,
  };
}

router.get(
  '/',
  canView,
  asyncHandler(async (req, res) => {
    const workspace = await Workspace.findById(req.workspace._id).select('projectFolders').lean();
    sendSuccess(res, { settings: settingsOf(workspace) });
  }),
);

router.put(
  '/',
  canManage,
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => {
    const { folders } = req.body;
    if (folders) {
      const seen = new Set();
      for (const name of folders) {
        const key = name.toLowerCase();
        if (key === BRIEFS_FOLDER_NAME.toLowerCase()) {
          throw AppError.badRequest(
            `"${BRIEFS_FOLDER_NAME}" is always added, so it doesn't need to be in the list`,
            'BRIEFS_FOLDER',
          );
        }
        if (seen.has(key)) {
          throw AppError.badRequest(`"${name}" is in the list twice`, 'DUPLICATE_FOLDER');
        }
        seen.add(key);
      }
    }
    await Workspace.updateOne(
      { _id: req.workspace._id },
      folders ? { $set: { projectFolders: folders } } : { $unset: { projectFolders: 1 } },
    );
    const workspace = await Workspace.findById(req.workspace._id).select('projectFolders').lean();
    sendSuccess(res, { settings: settingsOf(workspace) });
  }),
);

export default router;
