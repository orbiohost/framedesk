import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';

function basePath(workspaceId) {
  return `/workspaces/${workspaceId}/calendar`;
}

export function useCalendarFeed(workspaceId, { from, to, projectId }) {
  const params = { from: from.toISOString(), to: to.toISOString(), projectId };
  return useQuery({
    queryKey: featureKey(workspaceId, 'calendar', params),
    queryFn: async () => (await api.get(`${basePath(workspaceId)}${toQueryString(params)}`)).items,
    placeholderData: (previous) => previous,
  });
}

// Creates when no id is given, updates otherwise.
export function useSaveEvent(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) => {
      const response = id
        ? await api.patch(`${basePath(workspaceId)}/events/${id}`, input)
        : await api.post(`${basePath(workspaceId)}/events`, input);
      return response.event;
    },
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['calendar']),
  });
}

export function useDeleteEvent(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId) => api.delete(`${basePath(workspaceId)}/events/${eventId}`),
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['calendar']),
  });
}
