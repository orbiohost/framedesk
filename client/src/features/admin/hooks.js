import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';

const adminKey = (...parts) => ['admin', ...parts];

function useAdminList(name, params, readItems) {
  return useInfiniteQuery({
    queryKey: adminKey(name, params),
    queryFn: ({ pageParam }) =>
      api.get(`/admin/${name}${toQueryString({ ...params, cursor: pageParam })}`),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => ({ ...data, items: data.pages.flatMap(readItems) }),
  });
}

// Every admin change can move the dashboard numbers, so refresh all admin data.
function useAdminMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKey() });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useAdminDashboard() {
  return useQuery({ queryKey: adminKey('dashboard'), queryFn: () => api.get('/admin/dashboard') });
}

export function useAdminSystem() {
  return useQuery({
    queryKey: adminKey('system'),
    queryFn: () => api.get('/admin/system'),
    refetchInterval: 30000,
  });
}

export function useAdminUsers(params) {
  return useAdminList('users', params, (page) => page.users);
}

export function useAdminUser(userId) {
  return useQuery({
    queryKey: adminKey('user', userId),
    queryFn: () => api.get(`/admin/users/${userId}`),
    enabled: Boolean(userId),
  });
}

export function useSetUserStatus() {
  return useAdminMutation(({ userId, status }) =>
    api.post(`/admin/users/${userId}/status`, { status }),
  );
}

export function useAdminSubscriptions(params) {
  return useQuery({
    queryKey: adminKey('subscriptions', params),
    queryFn: async () =>
      (await api.get(`/admin/subscriptions${toQueryString(params)}`)).subscriptions,
    placeholderData: (previous) => previous,
  });
}

export function useAdjustSubscription() {
  return useAdminMutation(({ workspaceId, ...change }) =>
    api.post(`/admin/subscriptions/${workspaceId}/adjust`, change),
  );
}

export function useRecordPayment() {
  return useAdminMutation(({ workspaceId, ...payment }) =>
    api.post(`/admin/subscriptions/${workspaceId}/payments`, payment),
  );
}

export function useAdminPayments(params) {
  return useAdminList('payments', params, (page) => page.payments);
}

export function paymentsExportUrl(params) {
  return `/api/admin/payments/export${toQueryString(params)}`;
}

export function useAdminAuditLog() {
  return useAdminList('audit-log', {}, (page) => page.entries);
}

export function useAdminUpgradeRequests() {
  return useQuery({
    queryKey: adminKey('upgrade-requests'),
    queryFn: async () => (await api.get('/admin/upgrade-requests')).requests,
  });
}

export function useActivateUpgradeRequest() {
  return useAdminMutation(({ requestId, ...payment }) =>
    api.post(`/admin/upgrade-requests/${requestId}/activate`, payment),
  );
}
