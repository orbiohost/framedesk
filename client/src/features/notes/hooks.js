import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { featureKey } from '../../lib/workspaceKeys.js';

function path(workspaceId) {
  return `/workspaces/${workspaceId}/notes/me`;
}

export function useMyNote(workspaceId) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'notes', 'me'),
    queryFn: async () => (await api.get(path(workspaceId))).note,
    staleTime: Infinity,
  });
}

export function useSaveNote(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.patch(path(workspaceId), { body })).note,
    onSuccess: (note) => queryClient.setQueryData(featureKey(workspaceId, 'notes', 'me'), note),
  });
}
