import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { featureKey } from '../../lib/workspaceKeys.js';

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
