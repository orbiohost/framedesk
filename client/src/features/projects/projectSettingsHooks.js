import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { featureKey } from '../../lib/workspaceKeys.js';

const FEATURE = 'project-settings';

function path(workspaceId) {
  return `/workspaces/${workspaceId}/project-settings`;
}

// { folders, custom, builtIn, alwaysIncluded, maxFolders }
export function useProjectSettings(workspaceId) {
  return useQuery({
    queryKey: featureKey(workspaceId, FEATURE),
    queryFn: async () => (await api.get(path(workspaceId))).settings,
    enabled: Boolean(workspaceId),
  });
}

// folders: the new list, or null for the built-in one.
export function useSaveProjectSettings(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (folders) => (await api.put(path(workspaceId), { folders })).settings,
    onSuccess: (settings) => queryClient.setQueryData(featureKey(workspaceId, FEATURE), settings),
  });
}

const TEMPLATES = 'task-templates';

// { templates: { [type]: { steps, custom } }, maxSteps }
export function useTaskTemplates(workspaceId) {
  return useQuery({
    queryKey: featureKey(workspaceId, FEATURE, TEMPLATES),
    queryFn: () => api.get(`${path(workspaceId)}/${TEMPLATES}`),
    enabled: Boolean(workspaceId),
  });
}

// steps: the type's new list, or null for the built-in one.
export function useSaveTaskTemplate(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, steps }) =>
      api.put(`${path(workspaceId)}/${TEMPLATES}/${type}`, { steps }),
    onSuccess: (data) =>
      queryClient.setQueryData(featureKey(workspaceId, FEATURE, TEMPLATES), data),
  });
}
