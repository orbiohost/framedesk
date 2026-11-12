import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { featureKey } from '../../lib/workspaceKeys.js';

// The chat has no push channel yet, so it polls while the tab is visible.
const POLL_MS = 5000;

function basePath(workspaceId) {
  return `/workspaces/${workspaceId}/chat`;
}

export function useMessages(workspaceId) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'chat'),
    queryFn: async () => (await api.get(basePath(workspaceId))).messages,
    refetchInterval: POLL_MS,
  });
}

export function useSendMessage(workspaceId) {
  const queryClient = useQueryClient();
  const key = featureKey(workspaceId, 'chat');
  return useMutation({
    mutationFn: async (body) => (await api.post(basePath(workspaceId), { body })).message,
    onSuccess: (message) => {
      queryClient.setQueryData(key, (messages = []) =>
        messages.some((existing) => existing.id === message.id) ? messages : [...messages, message],
      );
    },
  });
}

export function useDeleteMessage(workspaceId) {
  const queryClient = useQueryClient();
  const key = featureKey(workspaceId, 'chat');
  return useMutation({
    mutationFn: (messageId) => api.delete(`${basePath(workspaceId)}/${messageId}`),
    onSuccess: (_data, messageId) => {
      queryClient.setQueryData(key, (messages = []) =>
        messages.filter((message) => message.id !== messageId),
      );
    },
  });
}
