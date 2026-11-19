import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { featureKey } from '../../lib/workspaceKeys.js';
import { workspaceKeys } from '../workspaces/hooks.js';

export function useMembers(workspaceId) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'members'),
    queryFn: async () => (await api.get(`/workspaces/${workspaceId}/members`)).members,
    // Short, so people who join or leave show up on the next visit or window focus.
    staleTime: 30 * 1000,
  });
}

export function memberOptions(members = []) {
  return members.map((member) => ({ value: member.userId, label: member.name }));
}

export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin: everything, incl. members and settings' },
  { value: 'manager', label: 'Manager: run projects, clients and shares' },
  { value: 'editor', label: 'Editor: work on projects, files and tasks' },
  { value: 'viewer', label: 'Viewer: look, but not change' },
];

export function useInvites(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'members', 'invites'),
    queryFn: async () => (await api.get(`/workspaces/${workspaceId}/members/invites`)).invites,
    enabled,
  });
}

function useMembersMutation(workspaceId, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: featureKey(workspaceId, 'members') }),
  });
}

export function useCreateInvite(workspaceId) {
  return useMembersMutation(workspaceId, (input) =>
    api.post(`/workspaces/${workspaceId}/members/invites`, input),
  );
}

export function useRevokeInvite(workspaceId) {
  return useMembersMutation(workspaceId, (inviteId) =>
    api.delete(`/workspaces/${workspaceId}/members/invites/${inviteId}`),
  );
}

export function useChangeMemberRole(workspaceId) {
  return useMembersMutation(workspaceId, ({ userId, role }) =>
    api.patch(`/workspaces/${workspaceId}/members/${userId}`, { role }),
  );
}

export function useRemoveMember(workspaceId) {
  return useMembersMutation(workspaceId, (userId) =>
    api.delete(`/workspaces/${workspaceId}/members/${userId}`),
  );
}

export function useInvitePreview(token) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: async () => (await api.get(`/invites/${encodeURIComponent(token)}`)).invite,
    retry: false,
  });
}

export function useAcceptInvite(token) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/invites/${encodeURIComponent(token)}/accept`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.all }),
  });
}
