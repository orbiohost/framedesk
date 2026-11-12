import { z } from 'zod';
import { objectId } from '../../utils/zodHelpers.js';

const workspaceName = z.string().trim().min(1, 'Give the workspace a name').max(80);

export const workspaceParamsSchema = z.object({ workspaceId: objectId });

export const createWorkspaceSchema = z.object({ name: workspaceName });

export const updateWorkspaceSchema = z.object({ name: workspaceName });

export const deleteWorkspaceSchema = z.object({
  confirmName: z.string().min(1, 'Type the workspace name to confirm'),
});
