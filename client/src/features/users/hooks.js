import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: usersApi.changePassword,
    // A Google account that just set its first password now has one.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: currentUserKey }),
  });
}

export const accountBillingKey = ['account-billing'];

export function useAccountBilling() {
  return useQuery({ queryKey: accountBillingKey, queryFn: usersApi.billing, staleTime: 60 * 1000 });
}

export function useUpdateBillingProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: usersApi.updateBillingProfile,
    onSuccess: ({ user }) => {
      queryClient.setQueryData(currentUserKey, user);
      queryClient.invalidateQueries({ queryKey: accountBillingKey });
    },
  });
}

// Fetches the invoice PDF, then opens it in a new tab or saves it.
export function useInvoicePdf() {
  return useMutation({
    mutationFn: async ({ payment, mode, target }) => {
      const blob = await usersApi.invoicePdf(payment.id);
      const url = URL.createObjectURL(blob);
      if (mode === 'open' && target) {
        target.location.href = url;
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice-${payment.invoiceNumber}.pdf`;
        document.body.append(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (_error, { target }) => target?.close(),
  });
}
