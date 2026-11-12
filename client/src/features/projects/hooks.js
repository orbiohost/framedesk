import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';
import { workspaceKeys } from '../workspaces/hooks.js';

function basePath(workspaceId) {
  return `/workspaces/${workspaceId}/projects`;
}

export function useProjects(workspaceId, params = {}, options = {}) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'projects', 'list', params),
    queryFn: async () =>
      (await api.get(`${basePath(workspaceId)}${toQueryString(params)}`)).projects,
    ...options,
  });
}

export function useProject(workspaceId, projectId) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'projects', 'detail', projectId),
    queryFn: async () => (await api.get(`${basePath(workspaceId)}/${projectId}`)).project,
  });
}

// Creates when no id is given, updates otherwise.
export function useSaveProject(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) => {
      const response = id
        ? await api.patch(`${basePath(workspaceId)}/${id}`, input)
        : await api.post(basePath(workspaceId), input);
      return response.project;
    },
    onSuccess: () =>
      invalidateFeatures(queryClient, workspaceId, ['projects', 'clients', 'calendar']),
  });
}

// Deletes a project with its files, tasks and events. Frees storage, so the meter
// refreshes. The deleted project's own detail query is not refetched (it would 404).
export function useDeleteProject(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId) => api.delete(`${basePath(workspaceId)}/${projectId}`),
    onSuccess: (_data, projectId) => {
      const deletedDetail = featureKey(workspaceId, 'projects', 'detail', projectId);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      queryClient.invalidateQueries({
        queryKey: ['ws', workspaceId],
        predicate: (query) => JSON.stringify(query.queryKey) !== JSON.stringify(deletedDetail),
      });
    },
  });
}

export function projectOptions(projects = []) {
  return projects.map((project) => ({ value: project.id, label: project.title }));
}
