import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';

function basePath(workspaceId) {
  return `/workspaces/${workspaceId}/clients`;
}

export function useClients(workspaceId, params = {}) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'clients', 'list', params),
    queryFn: async () =>
      (await api.get(`${basePath(workspaceId)}${toQueryString(params)}`)).clients,
  });
}

export function useClient(workspaceId, clientId) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'clients', 'detail', clientId),
    queryFn: async () => (await api.get(`${basePath(workspaceId)}/${clientId}`)).client,
  });
}

// Creates when no id is given, updates otherwise.
export function useSaveClient(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) => {
      const response = id
        ? await api.patch(`${basePath(workspaceId)}/${id}`, input)
        : await api.post(basePath(workspaceId), input);
      return response.client;
    },
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['clients', 'projects']),
  });
}

export function useSetClientArchived(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }) => {
      const action = archived ? 'archive' : 'restore';
      return (await api.post(`${basePath(workspaceId)}/${id}/${action}`)).client;
    },
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['clients']),
  });
}

export function useDeleteClient(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => api.delete(`${basePath(workspaceId)}/${id}`),
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['clients', 'projects']),
  });
}

export function clientOptions(clients = []) {
  return clients.map((client) => ({
    value: client.id,
    label: client.company ? `${client.name} · ${client.company}` : client.name,
  }));
}
