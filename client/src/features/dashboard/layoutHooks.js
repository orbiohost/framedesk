import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { featureKey } from '../../lib/workspaceKeys.js';
import { DEFAULT_LAYOUT, normalizeLayout } from './widgetCatalog.js';

function path(workspaceId) {
  return `/workspaces/${workspaceId}/dashboard/layout`;
}

function layoutKey(workspaceId) {
  return featureKey(workspaceId, 'dashboard', 'layout');
}

// The person's saved widget list, or the default when they never customised it.
export function useDashboardLayout(workspaceId) {
  const query = useQuery({
    queryKey: layoutKey(workspaceId),
    queryFn: async () => (await api.get(path(workspaceId))).layout,
    staleTime: Infinity,
  });
  const saved = query.data?.widgets;
  return {
    ...query,
    widgets: saved ? normalizeLayout(saved) : DEFAULT_LAYOUT,
    isCustomized: Boolean(saved),
  };
}

// Applies the change on screen immediately and rolls back if the save fails.
export function useSaveDashboardLayout(workspaceId) {
  const queryClient = useQueryClient();
  const key = layoutKey(workspaceId);

  return useMutation({
    mutationFn: async (widgets) =>
      widgets === null
        ? (await api.delete(path(workspaceId))).layout
        : (await api.patch(path(workspaceId), { widgets })).layout,
    onMutate: async (widgets) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, widgets === null ? null : { widgets });
      return { previous };
    },
    onError: (_error, _widgets, context) => queryClient.setQueryData(key, context?.previous),
    onSuccess: (layout) => queryClient.setQueryData(key, layout),
  });
}
