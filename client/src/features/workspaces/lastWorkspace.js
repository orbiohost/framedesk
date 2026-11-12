import { readLocal, writeLocal } from '../../lib/storage.js';

const KEY = 'lastWorkspaceId';

export function rememberWorkspace(workspaceId) {
  writeLocal(KEY, workspaceId);
}

export function pickStartingWorkspace(workspaces) {
  const lastId = readLocal(KEY);
  return workspaces.find((workspace) => workspace.id === lastId) ?? workspaces[0];
}
