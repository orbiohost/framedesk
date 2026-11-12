import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { featureKey } from '../../lib/workspaceKeys.js';

const pricingKey = ['pricing'];

export function usePricing() {
  return useQuery({
    queryKey: pricingKey,
    queryFn: () => api.get('/plans'),
    staleTime: 10 * 60 * 1000,
  });
}

function upgradeRequestKey(workspaceId) {
  return featureKey(workspaceId, 'upgrade-request');
}

export function useCurrentUpgradeRequest(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: upgradeRequestKey(workspaceId),
    queryFn: async () =>
      (await api.get(`/workspaces/${workspaceId}/upgrade-requests/current`)).request,
    enabled,
  });
}

export function useRequestUpgrade(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) =>
      (await api.post(`/workspaces/${workspaceId}/upgrade-requests`, input)).request,
    onSuccess: (request) => queryClient.setQueryData(upgradeRequestKey(workspaceId), request),
  });
}
