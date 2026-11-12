import { api } from '../../lib/apiClient.js';

export const workspacesApi = {
  list: () => api.get('/workspaces'),
  get: (workspaceId) => api.get(`/workspaces/${workspaceId}`),
  create: (input) => api.post('/workspaces', input),
  rename: (workspaceId, input) => api.patch(`/workspaces/${workspaceId}`, input),
  remove: (workspaceId, confirmName) => api.delete(`/workspaces/${workspaceId}`, { confirmName }),
};
