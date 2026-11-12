import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from './api.js';

export const workspaceKeys = {
  all: ['workspaces'],
  detail: (workspaceId) => ['workspaces', workspaceId],
};

export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.all,
    queryFn: async () => (await workspacesApi.list()).workspaces,
  });
}

export function useWorkspace(workspaceId) {
  return useQuery({
    queryKey: workspaceKeys.detail(workspaceId),
    queryFn: async () => (await workspacesApi.get(workspaceId)).workspace,
    enabled: Boolean(workspaceId),
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => (await workspacesApi.create(input)).workspace,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}

export function useRenameWorkspace(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => (await workspacesApi.rename(workspaceId, input)).workspace,
    onSuccess: (workspace) => {
      queryClient.setQueryData(workspaceKeys.detail(workspaceId), workspace);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
    },
  });
}

// Deletes the workspace for good. The caller navigates away on success; the
// deleted workspace's own queries are left alone (refetching them would 404)
// and are garbage-collected once nothing uses them.
export function useDeleteWorkspace(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (confirmName) => workspacesApi.remove(workspaceId, confirmName),
    onSuccess: () => {
      queryClient.setQueryData(workspaceKeys.all, (workspaces) =>
        workspaces?.filter((workspace) => workspace.id !== workspaceId),
      );
      // Other workspaces may share this one's storage, so refresh them too.
      return queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'workspaces' && query.queryKey[1] !== workspaceId,
      });
    },
  });
}
