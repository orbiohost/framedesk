import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey } from '../../lib/workspaceKeys.js';

export const SHARE_AUDIENCE_OPTIONS = [
  { value: 'anyone', label: 'Anyone with link', hint: 'No account needed' },
  { value: 'signed_in', label: 'Signed-in only', hint: 'FrameDesk account required' },
];

export const SHARE_PERMISSION_OPTIONS = [
  { value: 'view', label: 'Can view', hint: 'Read-only access' },
  { value: 'edit', label: 'Can edit', hint: 'Add and update tasks' },
];

export function shareUrl(token) {
  return `${window.location.origin}/share/${token}`;
}

// ---------------------------------------------------------------------------
// Managing a project's link (inside the workspace)

function settingsPath(workspaceId, projectId) {
  return `/workspaces/${workspaceId}/projects/${projectId}/share`;
}

function settingsKey(workspaceId, projectId) {
  return featureKey(workspaceId, 'projects', 'share', projectId);
}

export function useShareSettings(workspaceId, projectId, { enabled = true } = {}) {
  return useQuery({
    queryKey: settingsKey(workspaceId, projectId),
    queryFn: async () => (await api.get(settingsPath(workspaceId, projectId))).share,
    enabled,
  });
}

function useShareMutation(workspaceId, projectId, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (share) => {
      queryClient.setQueryData(settingsKey(workspaceId, projectId), share);
      // The project's "Shared" badge comes from its detail and list queries.
      queryClient.invalidateQueries({ queryKey: featureKey(workspaceId, 'projects', 'detail') });
      queryClient.invalidateQueries({ queryKey: featureKey(workspaceId, 'projects', 'list') });
    },
  });
}

// input: any of { enabled, audience, permission }
export function useUpdateShare(workspaceId, projectId) {
  return useShareMutation(
    workspaceId,
    projectId,
    async (input) => (await api.patch(settingsPath(workspaceId, projectId), input)).share,
  );
}

export function useResetShareLink(workspaceId, projectId) {
  return useShareMutation(
    workspaceId,
    projectId,
    async () => (await api.post(`${settingsPath(workspaceId, projectId)}/reset`)).share,
  );
}

// ---------------------------------------------------------------------------
// Opening a link (anyone; works signed out)

function publicPath(token) {
  return `/share/${encodeURIComponent(token)}`;
}

export function sharedKey(token, ...rest) {
  return ['share', token, ...rest];
}

// A link that was turned off or needs sign-in won't change by retrying.
function retryUnlessFinal(failureCount, error) {
  if ([401, 403, 404].includes(error?.status)) return false;
  return failureCount < 2;
}

export function useSharedProject(token) {
  return useQuery({
    queryKey: sharedKey(token, 'project'),
    queryFn: () => api.get(publicPath(token)),
    retry: retryUnlessFinal,
  });
}

export function useSharedTasks(token) {
  return useQuery({
    queryKey: sharedKey(token, 'tasks'),
    queryFn: async () => (await api.get(`${publicPath(token)}/tasks`)).tasks,
    retry: retryUnlessFinal,
  });
}

// Creates when no id is given, updates otherwise.
export function useSaveSharedTask(token) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) => {
      const response = id
        ? await api.patch(`${publicPath(token)}/tasks/${id}`, input)
        : await api.post(`${publicPath(token)}/tasks`, input);
      return response.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedKey(token, 'tasks') });
      // Task counts on the overview.
      queryClient.invalidateQueries({ queryKey: sharedKey(token, 'project') });
    },
  });
}

export function useSharedFiles(token) {
  return useInfiniteQuery({
    queryKey: sharedKey(token, 'files'),
    queryFn: ({ pageParam }) =>
      api.get(`${publicPath(token)}/files${toQueryString({ cursor: pageParam })}`),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: retryUnlessFinal,
  });
}

export function useSharedPreviewUrls(token, fileIds) {
  return useQuery({
    queryKey: sharedKey(token, 'preview-urls', fileIds),
    queryFn: async () =>
      (await api.post(`${publicPath(token)}/files/preview-urls`, { fileIds })).urls,
    enabled: fileIds.length > 0,
    // Signed links last 15 minutes; refresh well before that.
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
}

export function fetchSharedFileUrl(token, fileId, disposition) {
  return api.get(`${publicPath(token)}/files/${fileId}/url${toQueryString({ disposition })}`);
}

export function useSharedCalendar(token, { from, to }) {
  return useQuery({
    queryKey: sharedKey(token, 'calendar', from.toISOString(), to.toISOString()),
    queryFn: async () =>
      (
        await api.get(
          `${publicPath(token)}/calendar${toQueryString({ from: from.toISOString(), to: to.toISOString() })}`,
        )
      ).items,
    retry: retryUnlessFinal,
  });
}

export function useSharedNotes(token) {
  return useQuery({
    queryKey: sharedKey(token, 'notes'),
    queryFn: async () => (await api.get(`${publicPath(token)}/notes`)).notes,
    retry: retryUnlessFinal,
  });
}
