import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey } from '../../lib/workspaceKeys.js';

export const MAX_SHARED_FILES = 100;

export function fileShareUrl(token) {
  return `${window.location.origin}/share/files/${token}`;
}

// ---------------------------------------------------------------------------
// Managing links (inside the workspace)

function sharesPath(workspaceId) {
  return `/workspaces/${workspaceId}/file-shares`;
}

function sharesKey(workspaceId, ...rest) {
  return featureKey(workspaceId, 'file-shares', ...rest);
}

// Every file link this person may manage, newest first.
export function useFileShares(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: sharesKey(workspaceId, 'list'),
    queryFn: async () => (await api.get(sharesPath(workspaceId))).shares,
    enabled,
  });
}

// The link that shares exactly these files, or null when there is none yet.
export function useFileShareFor(workspaceId, fileIds, { enabled = true } = {}) {
  const ids = [...fileIds].sort();
  return useQuery({
    queryKey: sharesKey(workspaceId, 'find', ids),
    queryFn: async () =>
      (await api.get(`${sharesPath(workspaceId)}/find${toQueryString({ ids: ids.join(',') })}`))
        .share,
    enabled: enabled && ids.length > 0,
  });
}

function useShareMutation(workspaceId, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sharesKey(workspaceId) }),
  });
}

// input: { fileIds, audience }
export function useCreateFileShare(workspaceId) {
  return useShareMutation(
    workspaceId,
    async (input) => (await api.post(sharesPath(workspaceId), input)).share,
  );
}

// input: { id, audience }
export function useUpdateFileShare(workspaceId) {
  return useShareMutation(
    workspaceId,
    async ({ id, ...input }) => (await api.patch(`${sharesPath(workspaceId)}/${id}`, input)).share,
  );
}

// Deleting the link is how sharing stops.
export function useDeleteFileShare(workspaceId) {
  return useShareMutation(workspaceId, (id) => api.delete(`${sharesPath(workspaceId)}/${id}`));
}

// ---------------------------------------------------------------------------
// Opening a link (anyone; works signed out)

function publicPath(token) {
  return `/file-share/${encodeURIComponent(token)}`;
}

// Under the 'share' root, which is never kept in the offline cache.
function linkKey(token, ...rest) {
  return ['share', 'files', token, ...rest];
}

// A link that was deleted or needs sign-in won't change by retrying.
function retryUnlessFinal(failureCount, error) {
  if ([401, 403, 404].includes(error?.status)) return false;
  return failureCount < 2;
}

export function useSharedFilesLink(token) {
  return useQuery({
    queryKey: linkKey(token),
    queryFn: () => api.get(publicPath(token)),
    retry: retryUnlessFinal,
  });
}

export function useSharedFilesPreviewUrls(token, fileIds) {
  return useQuery({
    queryKey: linkKey(token, 'preview-urls', fileIds),
    queryFn: async () =>
      (await api.post(`${publicPath(token)}/files/preview-urls`, { fileIds })).urls,
    enabled: fileIds.length > 0,
    // Signed links last 15 minutes; refresh well before that.
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
}

export function fetchSharedFilesLinkUrl(token, fileId, disposition) {
  return api.get(`${publicPath(token)}/files/${fileId}/url${toQueryString({ disposition })}`);
}
