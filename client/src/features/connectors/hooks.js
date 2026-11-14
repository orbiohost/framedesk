import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connectorsApi } from './api.js';

export const connectorsKey = ['connectors'];

export function useConnectors() {
  return useQuery({ queryKey: connectorsKey, queryFn: connectorsApi.list });
}

function useConnectorMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectorsKey }),
  });
}

export function useCreateApiKey() {
  return useConnectorMutation(connectorsApi.createKey);
}

export function useUpdateConnectionWorkspaces() {
  return useConnectorMutation(connectorsApi.updateWorkspaces);
}

export function useRevokeConnection() {
  return useConnectorMutation(connectorsApi.revoke);
}

export function useAuthorizationRequest(params) {
  return useQuery({
    queryKey: ['connector-authorization', params],
    queryFn: () => connectorsApi.describeAuthorization(params),
    retry: false,
    staleTime: Infinity,
  });
}

export function useDecideAuthorization() {
  return useConnectorMutation(connectorsApi.decideAuthorization);
}
