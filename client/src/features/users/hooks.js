import { useMutation, useQueryClient } from '@tanstack/react-query';
import { currentUserKey } from '../auth/hooks.js';
import { usersApi } from './api.js';

// Member lists and tasks carry each person's name and picture, so every
// workspace's copy is stale once either changes.
function useProfileMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: ({ user }) => {
      queryClient.setQueryData(currentUserKey, user);
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'ws' && ['members', 'tasks'].includes(query.queryKey[2]),
      });
    },
  });
}

export function useUpdateProfile() {
  return useProfileMutation(usersApi.updateProfile);
}

export function useSetAvatar() {
  return useProfileMutation(usersApi.setAvatar);
}

export function useClearAvatar() {
  return useProfileMutation(usersApi.clearAvatar);
}

export function useChangePassword() {
  return useMutation({ mutationFn: usersApi.changePassword });
}
