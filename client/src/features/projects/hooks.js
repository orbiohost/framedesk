import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';
import { workspaceKeys } from '../workspaces/hooks.js';
import { isProjectOpen } from './projectMeta.js';

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
    // A new project may start with its type's task list.
    onSuccess: () =>
      invalidateFeatures(queryClient, workspaceId, ['projects', 'clients', 'calendar', 'tasks']),
  });
}

// Adds the project type's task list (Project settings) to an existing project.
export function useApplyTaskTemplate(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId) =>
      (await api.post(`${basePath(workspaceId)}/${projectId}/task-template`)).created,
    onSuccess: () =>
      invalidateFeatures(queryClient, workspaceId, ['projects', 'tasks', 'calendar']),
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

// Dropdown options. Pass `keepId` (the project already chosen) to offer only
// projects still in progress plus that one, so finished work doesn't pad the list.
export function projectOptions(projects = [], keepId) {
  const offered =
    keepId === undefined
      ? projects
      : projects.filter((project) => isProjectOpen(project) || project.id === keepId);
  return offered.map((project) => ({ value: project.id, label: project.title }));
}
