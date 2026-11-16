import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';

function basePath(workspaceId) {
  return `/workspaces/${workspaceId}/social`;
}

export function useSocialAccounts(workspaceId) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'social', 'accounts'),
    queryFn: async () => (await api.get(`${basePath(workspaceId)}/accounts`)).accounts,
  });
}

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function useSocialAnalytics(workspaceId) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'social', 'analytics'),
    queryFn: async () =>
      (await api.get(`${basePath(workspaceId)}/analytics${toQueryString({ tz: browserTimeZone() })}`))
        .analytics,
  });
}

// Which platforms can be linked by logging in on this server ({ instagram: { oauth } ...}).
export function useSocialProviders(workspaceId) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'social', 'providers'),
    queryFn: async () => (await api.get(`${basePath(workspaceId)}/providers`)).providers,
    staleTime: 5 * 60 * 1000,
  });
}

// Sends the browser to the platform's login. It comes back to the Social page.
export function useStartSocialOAuth(workspaceId) {
  return useMutation({
    mutationFn: async (provider) => {
      const { url } = await api.post(`${basePath(workspaceId)}/oauth/${provider}/start`, {
        returnTo: `/w/${workspaceId}/social`,
      });
      window.location.assign(url);
      return url;
    },
  });
}

export function useUpdateSocialAccount(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, ...input }) =>
      (await api.patch(`${basePath(workspaceId)}/accounts/${accountId}`, input)).account,
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['social']),
  });
}

export function useAddSocialPost(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, ...input }) =>
      (await api.post(`${basePath(workspaceId)}/accounts/${accountId}/posts`, input)).post,
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['social']),
  });
}

export function useDeleteSocialPost(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contentId) => api.delete(`${basePath(workspaceId)}/content/${contentId}`),
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['social']),
  });
}

export function useSocialContent(workspaceId, params = {}) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'social', 'content', params),
    queryFn: async () =>
      (await api.get(`${basePath(workspaceId)}/content${toQueryString(params)}`)).posts,
  });
}

export function useConnectSocialAccount(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) =>
      (await api.post(`${basePath(workspaceId)}/accounts`, input)).account,
    onSuccess: () => {
      invalidateFeatures(queryClient, workspaceId, ['social']);
    },
  });
}

export function useDisconnectSocialAccount(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId) =>
      api.delete(`${basePath(workspaceId)}/accounts/${accountId}`),
    onSuccess: () => {
      invalidateFeatures(queryClient, workspaceId, ['social']);
    },
  });
}

export function useSyncSocialAccount(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId) =>
      (await api.post(`${basePath(workspaceId)}/accounts/${accountId}/sync`)).account,
    onSuccess: () => {
      invalidateFeatures(queryClient, workspaceId, ['social']);
    },
  });
}

export function useGenerateSocialSuggestions(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      (
        await api.post(`${basePath(workspaceId)}/suggestions`, {
          timeZone: browserTimeZone(),
          ...body,
        })
      ).suggestions,
    // The analysis is saved on the account and fills in per-post notes.
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['social']),
  });
}

export function useOptimizeSocialPost(workspaceId) {
  return useMutation({
    mutationFn: async (body) =>
      (await api.post(`${basePath(workspaceId)}/optimize`, body)).result,
  });
}

export const PLATFORM_CONFIG = {
  instagram: {
    name: 'Instagram',
    color: '#E1306C',
    bgLight: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
    badge: 'bg-gradient-to-r from-purple-500 via-pink-500 to-amber-500 text-white',
    audienceLabel: 'Followers',
    primaryFormat: 'Reels & Carousels',
    handlePrefix: '@',
    placeholder: 'username_or_brand',
  },
  whatsapp: {
    name: 'WhatsApp',
    color: '#25D366',
    bgLight: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    badge: 'bg-emerald-600 text-white',
    audienceLabel: 'Subscribers / Contacts',
    primaryFormat: 'Broadcasts & Catalog',
    handlePrefix: '+',
    placeholder: '1234567890 or Community Name',
  },
  youtube: {
    name: 'YouTube',
    color: '#FF0000',
    bgLight: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    badge: 'bg-red-600 text-white',
    audienceLabel: 'Subscribers',
    primaryFormat: 'Shorts & Longform',
    handlePrefix: '@',
    placeholder: 'channel_handle',
  },
  linkedin: {
    name: 'LinkedIn',
    color: '#0A66C2',
    bgLight: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    badge: 'bg-blue-600 text-white',
    audienceLabel: 'Connections & Followers',
    primaryFormat: 'Carousels & Industry Posts',
    handlePrefix: '@',
    placeholder: 'company-or-profile',
  },
  tiktok: {
    name: 'TikTok',
    color: '#000000',
    bgLight: 'bg-slate-900/10 text-slate-800 dark:text-slate-200 border-slate-500/20',
    badge: 'bg-slate-900 dark:bg-slate-800 text-white',
    audienceLabel: 'Followers',
    primaryFormat: 'Short-form Video',
    handlePrefix: '@',
    placeholder: 'username',
  },
  twitter: {
    name: 'X (Twitter)',
    color: '#1DA1F2',
    bgLight: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    badge: 'bg-sky-600 text-white',
    audienceLabel: 'Followers',
    primaryFormat: 'Threads & Announcements',
    handlePrefix: '@',
    placeholder: 'handle',
  },
  facebook: {
    name: 'Facebook',
    color: '#1877F2',
    bgLight: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    badge: 'bg-indigo-600 text-white',
    audienceLabel: 'Page Likes & Followers',
    primaryFormat: 'Posts & Videos',
    handlePrefix: '@',
    placeholder: 'page_name',
  },
};

// "Paste a link": detects the platform and how it can connect.
export function useSocialLookup(workspaceId) {
  return useMutation({
    mutationFn: async (body) => (await api.post(`${basePath(workspaceId)}/lookup`, body)).lookup,
  });
}

// A YouTube channel from just its link.
export function useCreatePublicAccount(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post(`${basePath(workspaceId)}/accounts/public`, body)).account,
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['social']),
  });
}

// Import with AI: read screenshots / exported files (nothing saved yet)...
export function useExtractSocialImport(workspaceId) {
  return useMutation({
    mutationFn: async (body) => (await api.post(`${basePath(workspaceId)}/import/extract`, body)).extracted,
  });
}

// ...then save what the team checked.
export function useSaveSocialImport(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => api.post(`${basePath(workspaceId)}/import/save`, body),
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['social']),
  });
}
