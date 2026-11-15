import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';

const FEATURE = 'briefs';
// While the AI is reading files or writing, the brief is checked again often.
export const BUSY_STATUSES = ['queued', 'waiting', 'generating'];

function basePath(workspaceId, projectId) {
  return `/workspaces/${workspaceId}/briefs/${projectId}`;
}

// The AI brief of a project's "Notes & Briefs" folder.
export function useProjectBrief(workspaceId, projectId, { enabled = true } = {}) {
  return useQuery({
    queryKey: featureKey(workspaceId, FEATURE, projectId),
    queryFn: async () => (await api.get(basePath(workspaceId, projectId))).brief,
    enabled: enabled && Boolean(projectId),
    refetchInterval: (query) => {
      const brief = query.state.data;
      if (!brief?.aiEnabled) return false;
      return BUSY_STATUSES.includes(brief.status) ? 4000 : false;
    },
  });
}

export function useRegenerateBrief(workspaceId, projectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post(`${basePath(workspaceId, projectId)}/regenerate`)).brief,
    onSuccess: (brief) =>
      queryClient.setQueryData(featureKey(workspaceId, FEATURE, projectId), brief),
  });
}

export function useSaveBriefAsNote(workspaceId, projectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post(`${basePath(workspaceId, projectId)}/note`)).note,
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['quick-notes']),
  });
}

// itemIds: which action items; leave out for every one not yet a task.
export function useBriefTasks(workspaceId, projectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemIds) =>
      (await api.post(`${basePath(workspaceId, projectId)}/tasks`, itemIds ? { itemIds } : {}))
        .tasks,
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, [FEATURE, 'tasks', 'projects']),
  });
}
