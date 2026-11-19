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

export function useBillingSettings() {
  return useQuery({
    queryKey: adminKey('billing-settings'),
    queryFn: () => api.get('/admin/billing-settings'),
  });
}

export function useUpdateBillingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.put('/admin/billing-settings', input),
    onSuccess: (data) => {
      queryClient.setQueryData(adminKey('billing-settings'), data);
      // GST on/off and the rate change what the pricing page shows.
      queryClient.invalidateQueries({ queryKey: ['pricing'] });
    },
  });
}

export function useSampleInvoice() {
  return useMutation({
    mutationFn: async (target) => {
      const blob = await api.getBlob('/admin/billing-settings/sample-pdf');
      const url = URL.createObjectURL(blob);
      target.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (_error, target) => target?.close(),
  });
}

// ---- AI assistant: settings, usage and per-account credits ----

export function useAdminAi() {
  return useQuery({ queryKey: adminKey('ai'), queryFn: () => api.get('/admin/ai') });
}

export function useUpdateAdminAi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.put('/admin/ai', input),
    onSuccess: (data) => {
      queryClient.setQueryData(adminKey('ai'), data);
      // Credits per plan and packs show on the pricing pages; the switch shows in every workspace.
      queryClient.invalidateQueries({ queryKey: ['pricing'] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[2] === 'ai' });
      queryClient.invalidateQueries({ queryKey: adminKey('ai-accounts') });
    },
  });
}

export function useAdminAiAccounts(params) {
  return useQuery({
    queryKey: adminKey('ai-accounts', params),
    queryFn: async () => (await api.get(`/admin/ai/accounts${toQueryString(params)}`)).accounts,
    placeholderData: (previous) => previous,
  });
}

export function useAdjustAiCredits() {
  return useAdminMutation(({ workspaceId, ...change }) =>
    api.post(`/admin/ai/accounts/${workspaceId}/credits`, change),
  );
}

export function useSetAiAccess() {
  return useAdminMutation(({ workspaceId, blocked }) =>
    api.post(`/admin/ai/accounts/${workspaceId}/access`, { blocked }),
  );
}

export function useAdminAiLedger(workspaceId) {
  return useInfiniteQuery({
    queryKey: adminKey('ai-ledger', workspaceId),
    queryFn: ({ pageParam }) =>
      api.get(`/admin/ai/accounts/${workspaceId}/ledger${toQueryString({ cursor: pageParam })}`),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(workspaceId),
  });
}

export function useResetAiLimits() {
  return useAdminMutation(({ workspaceId }) =>
    api.post(`/admin/ai/accounts/${workspaceId}/reset-limits`),
  );
}

// Plans & coupons: the price list (paid plans, free plan, offer, referrals).
export function useAdminPlans() {
  return useQuery({
    queryKey: adminKey('plans'),
    queryFn: async () => (await api.get('/admin/plans')).catalog,
  });
}

export function useUpdateAdminPlans() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => (await api.put('/admin/plans', input)).catalog,
    onSuccess: (catalog) => {
      queryClient.setQueryData(adminKey('plans'), catalog);
      queryClient.invalidateQueries({ queryKey: ['pricing'] });
    },
  });
}

export function useAdminCoupons() {
  return useQuery({
    queryKey: adminKey('coupons'),
    queryFn: async () => (await api.get('/admin/coupons')).coupons,
  });
}

// Creates when no id is given, updates otherwise.
export function useSaveCoupon() {
  return useAdminMutation(async ({ id, ...input }) =>
    id
      ? (await api.put(`/admin/coupons/${id}`, input)).coupon
      : (await api.post('/admin/coupons', input)).coupon,
  );
}

export function useDeleteCoupon() {
  return useAdminMutation((id) => api.delete(`/admin/coupons/${id}`));
}

// Admin › Social apps: platform developer keys.
export function useAdminSocialApps() {
  return useQuery({ queryKey: adminKey('social'), queryFn: () => api.get('/admin/social') });
}

export function useSaveSocialApp() {
  return useAdminMutation(({ app, ...body }) => api.put(`/admin/social/apps/${app}`, body));
}

export function useClearSocialApp() {
  return useAdminMutation((app) => api.delete(`/admin/social/apps/${app}`));
}

export function useTestSocialApp() {
  return useMutation({ mutationFn: (app) => api.post(`/admin/social/apps/${app}/test`) });
}

export function useSaveYoutubeKey() {
  return useAdminMutation((apiKey) => api.put('/admin/social/youtube-key', { apiKey }));
}

export function useClearYoutubeKey() {
  return useAdminMutation(() => api.delete('/admin/social/youtube-key'));
}

export function useTestYoutubeKey() {
  return useMutation({ mutationFn: () => api.post('/admin/social/youtube-key/test') });
}

// Admin → Expenses: running costs (S3, AWS bill, AI) and hand-entered expenses.
export function useAdminCosts() {
  return useQuery({
    queryKey: adminKey('costs'),
    queryFn: () => api.get('/admin/costs'),
    // A bucket listing may be running in the background.
    refetchInterval: (query) => (query.state.data?.storage?.scanning ? 5000 : false),
  });
}

// Every cost change answers with the whole costs page.
function useCostMutation(request) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (data) => queryClient.setQueryData(adminKey('costs'), data),
  });
}

export function useUpdateCostSettings() {
  return useCostMutation((input) => api.put('/admin/costs/settings', input));
}

export function useRefreshStorageScan() {
  return useCostMutation(() => api.post('/admin/costs/refresh-storage'));
}

export function useRefreshAwsBill() {
  return useCostMutation(() => api.post('/admin/costs/refresh-aws'));
}

export function useSaveExpense() {
  return useCostMutation(({ id, ...input }) =>
    id ? api.put(`/admin/costs/expenses/${id}`, input) : api.post('/admin/costs/expenses', input),
  );
}

export function useDeleteExpense() {
  return useCostMutation((id) => api.delete(`/admin/costs/expenses/${id}`));
}
