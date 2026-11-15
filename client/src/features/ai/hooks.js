import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, ensureCsrfToken, refreshSession } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';

export const aiKey = (workspaceId, ...rest) => featureKey(workspaceId, 'ai', ...rest);

// Whether the assistant is on for this workspace, the usage limits and how
// much of the library has been analysed.
export function useAiStatus(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: aiKey(workspaceId, 'status'),
    queryFn: async () => (await api.get(`/workspaces/${workspaceId}/ai/status`)).status,
    enabled: enabled && Boolean(workspaceId),
    staleTime: 30 * 1000,
    // Keeps "resets in…" and studied-file counts fresh while the page is open.
    refetchInterval: (query) => (query.state.data?.library?.waiting > 0 ? 30 * 1000 : 120 * 1000),
  });
}

export function useAiThreads(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: aiKey(workspaceId, 'threads'),
    queryFn: async () => (await api.get(`/workspaces/${workspaceId}/ai/threads`)).threads,
    enabled,
  });
}

export function useAiThread(workspaceId, threadId) {
  return useQuery({
    queryKey: aiKey(workspaceId, 'thread', threadId),
    queryFn: () => api.get(`/workspaces/${workspaceId}/ai/threads/${threadId}`),
    enabled: Boolean(threadId),
  });
}

export function useRenameThread(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, title }) =>
      api.patch(`/workspaces/${workspaceId}/ai/threads/${threadId}`, { title }),
    onMutate: ({ threadId, title }) => {
      queryClient.setQueryData(aiKey(workspaceId, 'threads'), (threads) =>
        threads?.map((thread) => (thread.id === threadId ? { ...thread, title } : thread)),
      );
    },
  });
}

export function useDeleteThread(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId) => api.delete(`/workspaces/${workspaceId}/ai/threads/${threadId}`),
    onMutate: (threadId) => {
      queryClient.setQueryData(aiKey(workspaceId, 'threads'), (threads) =>
        threads?.filter((thread) => thread.id !== threadId),
      );
      queryClient.removeQueries({ queryKey: aiKey(workspaceId, 'thread', threadId) });
    },
  });
}

// "Save to notes" on an answer. input: { threadId, messageId, title?, projectIds?, visibility? }
export function useSaveAnswerAsNote(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, messageId, ...input }) =>
      (
        await api.post(
          `/workspaces/${workspaceId}/ai/threads/${threadId}/messages/${messageId}/note`,
          input,
        )
      ).note,
    onSuccess: (note, { threadId, messageId }) => {
      queryClient.setQueryData(aiKey(workspaceId, 'thread', threadId), (current) =>
        current
          ? { ...current, savedNotes: { ...current.savedNotes, [messageId]: note.id } }
          : current,
      );
      invalidateFeatures(queryClient, workspaceId, ['quick-notes']);
    },
  });
}

// The "@" picker: files the viewer can open whose name matches.
export function useAiFileSearch(workspaceId, { q, projectId }, { enabled = true } = {}) {
  return useQuery({
    queryKey: aiKey(workspaceId, 'files', q, projectId ?? null),
    queryFn: async () =>
      (
        await api.get(
          `/workspaces/${workspaceId}/ai/files${toQueryString({ q: q || undefined, projectId })}`,
        )
      ).files,
    enabled,
    staleTime: 30 * 1000,
    placeholderData: (previous) => previous,
  });
}

// The Drive folder ("AI uploads") that files uploaded in the chat go to.
export async function fetchAiUploadFolder(workspaceId) {
  return (await api.post(`/workspaces/${workspaceId}/ai/upload-folder`)).folder;
}

export function useCreditHistory(workspaceId, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: aiKey(workspaceId, 'history'),
    queryFn: ({ pageParam }) =>
      api.get(
        `/workspaces/${workspaceId}/ai/credits/history${toQueryString({ cursor: pageParam })}`,
      ),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
}

// Splits a server-sent-events stream into { event, data } objects.
async function* readEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue; // heartbeat comments
      try {
        yield { event, data: JSON.parse(data) };
      } catch {
        // Ignore a malformed event.
      }
    }
  }
}

/**
 * Asks a question and streams the answer. onEvent receives each event:
 * thread, status, delta, done. Throws an ApiError when the server refuses
 * (out of usage, switched off...) and an AbortError when `signal` stops it.
 */
export async function askAiStream(workspaceId, question, { signal, onEvent }) {
  const open = async () =>
    fetch(`/api/workspaces/${workspaceId}/ai/ask`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-CSRF-Token': await ensureCsrfToken(),
      },
      body: JSON.stringify(question),
      signal,
    });

  let response = await open();
  if (response.status === 401 && (await refreshSession())) response = await open();
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new ApiError({
      status: response.status,
      code: payload?.error?.code ?? 'NETWORK_ERROR',
      message:
        payload?.error?.message ?? 'Could not reach the AI assistant. Check your connection.',
      details: payload?.error?.details,
    });
  }

  let finished = false;
  for await (const { event, data } of readEvents(response.body)) {
    if (event === 'error') {
      throw new ApiError({
        status: data.status ?? 500,
        code: data.code,
        message: data.message,
        details: data.details,
      });
    }
    if (event === 'done') finished = true;
    onEvent(event, data);
  }
  if (!finished) {
    throw new ApiError({
      status: 0,
      code: 'STREAM_CUT',
      message: 'The connection dropped before the answer finished. Please try again.',
    });
  }
}
