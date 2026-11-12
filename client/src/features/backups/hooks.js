import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey } from '../../lib/workspaceKeys.js';

function basePath(workspaceId) {
  return `/workspaces/${workspaceId}/backups`;
}

export function useBackupSummary(workspaceId, range) {
  const params = range ? { from: range.from, to: range.to } : {};
  return useQuery({
    queryKey: featureKey(workspaceId, 'backups', 'summary', params),
    queryFn: () => api.get(`${basePath(workspaceId)}/summary${toQueryString(params)}`),
    placeholderData: (previous) => previous,
  });
}

export function useBackupHistory(workspaceId) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'backups', 'history'),
    queryFn: async () => (await api.get(`${basePath(workspaceId)}/history`)).entries,
  });
}

// Gets a short-lived link, then hands the download to the browser's own download manager.
export function useStartBackupDownload(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ range, includeFiles }) => {
      const { url } = await api.post(`${basePath(workspaceId)}/link`, { ...range, includeFiles });
      window.location.assign(url);
    },
    onSuccess: () => {
      // The history entry is written when the zip finishes streaming.
      setTimeout(
        () =>
          queryClient.invalidateQueries({
            queryKey: featureKey(workspaceId, 'backups', 'history'),
          }),
        4000,
      );
    },
  });
}
