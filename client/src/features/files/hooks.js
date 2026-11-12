import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { cachedSignedUrl, forgetSignedUrls, peekSignedUrl } from '../../lib/signedUrlCache.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';
import { workspaceKeys } from '../workspaces/hooks.js';
import { getSnapshot, subscribe } from './uploadStore.js';

function filesPath(workspaceId) {
  return `/workspaces/${workspaceId}/files`;
}

function foldersPath(workspaceId) {
  return `/workspaces/${workspaceId}/folders`;
}

// Anything that adds or removes bytes also moves the storage meter. An owner's
// workspaces share one storage pool, so every workspace's meter is refreshed.
export function refreshAfterFileChange(queryClient, workspaceId) {
  queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
  // Every workspace's storage breakdown, since they may all draw on this pool.
  queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === 'ws' && queryKey[2] === 'files' && queryKey[3] === 'storage-usage',
  });
  return invalidateFeatures(queryClient, workspaceId, ['files', 'folders']);
}

export function useUploads() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// No projectId (null) means the workspace Drive: files that belong to no project.
export function useFolders(workspaceId, projectId = null) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'folders', projectId ?? 'drive'),
    queryFn: async () =>
      (await api.get(`${foldersPath(workspaceId)}${toQueryString({ projectId })}`)).folders,
  });
}

// params: { folderId } for a folder, or { projectId, trashed: true } for the trash
// (projectId null for the Drive's trash).
export function useFiles(workspaceId, params, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: featureKey(workspaceId, 'files', params),
    queryFn: ({ pageParam }) =>
      api.get(`${filesPath(workspaceId)}${toQueryString({ ...params, cursor: pageParam })}`),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
}

export function useSaveFolder(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) => {
      const response = id
        ? await api.patch(`${foldersPath(workspaceId)}/${id}`, input)
        : await api.post(foldersPath(workspaceId), input);
      return response.folder;
    },
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['folders']),
  });
}

export function useDeleteFolder(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folderId) => api.delete(`${foldersPath(workspaceId)}/${folderId}`),
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['folders']),
  });
}

// Who may open a folder: { id, access: "team" | "restricted", userIds }.
// What each person can see changes with it, so files are refreshed too.
export function useSetFolderAccess(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, access, userIds }) =>
      (await api.patch(`${foldersPath(workspaceId)}/${id}/access`, { access, userIds })).folder,
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['files', 'folders']),
  });
}

// One action on several files at once: { ids, action: "trash" } or
// { ids, action: "move", folderId }. Every file is tried; if some fail the
// error says how many, and the lists refresh either way.
export function useBulkFiles(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, action, folderId }) => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          action === 'move'
            ? api.patch(`${filesPath(workspaceId)}/${id}`, { folderId })
            : api.post(`${filesPath(workspaceId)}/${id}/trash`),
        ),
      );
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length > 0) {
        const verb = action === 'move' ? 'moved' : 'moved to Trash';
        throw new Error(
          `${failed.length} of ${ids.length} files could not be ${verb}: ${failed[0].reason.message}`,
        );
      }
    },
    onSettled: (_result, _error, { ids }) => {
      ids.forEach((id) => forgetFileUrls(workspaceId, id));
      return refreshAfterFileChange(queryClient, workspaceId);
    },
  });
}

// Deletes every file in a Trash for good: a project's, or the Drive's (null).
export function useEmptyTrash(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId) =>
      api.delete(`${filesPath(workspaceId)}/trash${toQueryString({ projectId })}`),
    onSuccess: () => refreshAfterFileChange(queryClient, workspaceId),
  });
}

export function useUpdateFile(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) =>
      (await api.patch(`${filesPath(workspaceId)}/${id}`, input)).file,
    onSuccess: (file, { id }) => {
      // A rename changes the download name inside the signed link.
      forgetFileUrls(workspaceId, id);
      return invalidateFeatures(queryClient, workspaceId, ['files', 'folders']);
    },
  });
}

// action: "trash" | "restore" | "delete" (delete = permanently, from the trash only)
export function useFileLifecycle(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }) =>
      action === 'delete'
        ? api.delete(`${filesPath(workspaceId)}/${id}`)
        : api.post(`${filesPath(workspaceId)}/${id}/${action}`),
    onSuccess: (result, { id }) => {
      forgetFileUrls(workspaceId, id);
      return refreshAfterFileChange(queryClient, workspaceId);
    },
  });
}

function fileUrlKey(workspaceId, fileId, disposition) {
  return `${workspaceId}/${fileId}/${disposition ?? 'attachment'}`;
}

function forgetFileUrls(workspaceId, fileId) {
  forgetSignedUrls(`${workspaceId}/${fileId}/`);
}

// Signed links are reused while they stay valid (see signedUrlCache.js).
// Pass { fresh: true } when the current link has stopped working.
export function fetchFileUrl(workspaceId, fileId, disposition, options) {
  return cachedSignedUrl(
    fileUrlKey(workspaceId, fileId, disposition),
    () => api.get(`${filesPath(workspaceId)}/${fileId}/url${toQueryString({ disposition })}`),
    options,
  );
}

export function peekFileUrl(workspaceId, fileId, disposition) {
  return peekSignedUrl(fileUrlKey(workspaceId, fileId, disposition));
}

// Images up to this size are downloaded in the background on hover, so the
// preview opens from the browser cache.
const WARM_IMAGE_MAX_BYTES = 15 * 1024 ** 2;

// Called when the pointer rests on a file row: gets its preview link ready
// before the click.
export function warmFilePreview(workspaceId, file) {
  if (!file.previewable) return;
  fetchFileUrl(workspaceId, file.id, 'inline')
    .then((url) => {
      if (!file.mime.startsWith('image/') || file.size > WARM_IMAGE_MAX_BYTES) return;
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
    })
    .catch(() => {
      // Only a head start; the preview fetches the link itself if this fails.
    });
}

// Thumbnails ask for their links one by one as they scroll into view; requests
// made within one short window go to the server as a single batch (the API's
// rate limit would not survive one request per thumbnail). Each link lands in
// the same cache as fetchFileUrl, so opening a thumbnailed file needs no request.
const BATCH_WINDOW_MS = 40;
const BATCH_MAX_IDS = 100;
const previewQueues = new Map(); // workspaceId -> Map(fileId -> [{ resolve, reject }])

async function flushPreviewQueue(workspaceId) {
  const queue = previewQueues.get(workspaceId);
  previewQueues.delete(workspaceId);
  const waiting = [...queue.entries()];
  for (let start = 0; start < waiting.length; start += BATCH_MAX_IDS) {
    const chunk = waiting.slice(start, start + BATCH_MAX_IDS);
    const ids = chunk.map(([fileId]) => fileId).join(',');
    try {
      const { urls, expiresAt } = await api.get(
        `${filesPath(workspaceId)}/preview-urls${toQueryString({ ids })}`,
      );
      for (const [fileId, waiters] of chunk) {
        for (const { resolve, reject } of waiters) {
          if (urls[fileId]) resolve({ url: urls[fileId], expiresAt });
          else reject(new Error('No preview for this file'));
        }
      }
    } catch (error) {
      for (const [, waiters] of chunk) waiters.forEach(({ reject }) => reject(error));
    }
  }
}

function queuePreviewUrl(workspaceId, fileId) {
  return new Promise((resolve, reject) => {
    if (!previewQueues.has(workspaceId)) {
      previewQueues.set(workspaceId, new Map());
      setTimeout(() => flushPreviewQueue(workspaceId), BATCH_WINDOW_MS);
    }
    const queue = previewQueues.get(workspaceId);
    queue.set(fileId, [...(queue.get(fileId) ?? []), { resolve, reject }]);
  });
}

export function fetchPreviewUrl(workspaceId, fileId) {
  return cachedSignedUrl(fileUrlKey(workspaceId, fileId, 'inline'), () =>
    queuePreviewUrl(workspaceId, fileId),
  );
}

// Used space split by file type, for the storage details dialog. Lives under
// the 'files' feature, so uploads, trashing and deleting refresh it.
export function useStorageUsage(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'files', 'storage-usage'),
    queryFn: async () => (await api.get(`${filesPath(workspaceId)}/storage-usage`)).usage,
    enabled,
  });
}
