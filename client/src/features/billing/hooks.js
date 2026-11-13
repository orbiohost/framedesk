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

// Online payment (Razorpay). Creating a checkout fixes the price and GST on the server.
export function useCreateCheckout(workspaceId) {
  return useMutation({
    mutationFn: async (input) =>
      (await api.post(`/workspaces/${workspaceId}/checkout`, input)).checkout,
  });
}

export function useConfirmCheckout(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (result) => api.post(`/workspaces/${workspaceId}/checkout/confirm`, result),
    onSuccess: () => {
      // The plan lives on every workspace summary, so refresh them all.
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['account-billing'] });
      queryClient.invalidateQueries({ queryKey: upgradeRequestKey(workspaceId) });
    },
  });
}

export function useCheckoutQuote(workspaceId, { planCode, interval }, { enabled = true } = {}) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'checkout-quote', planCode, interval),
    queryFn: async () =>
      (
        await api.get(
          `/workspaces/${workspaceId}/checkout/quote?planCode=${encodeURIComponent(planCode)}&interval=${interval}`,
        )
      ).quote,
    enabled: enabled && Boolean(planCode),
    staleTime: 30 * 1000,
  });
}
