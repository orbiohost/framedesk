import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';
import { toggleCheckLine } from './noteFormat.js';

const FEATURE = 'quick-notes';

function basePath(workspaceId) {
  return `/workspaces/${workspaceId}/quick-notes`;
}

// params: { q, projectId, tag, scope: 'all' | 'mine' | 'shared' }
export function useQuickNotes(workspaceId, params = {}, { enabled = true } = {}) {
  return useQuery({
    queryKey: featureKey(workspaceId, FEATURE, 'list', params),
    queryFn: async () => (await api.get(`${basePath(workspaceId)}${toQueryString(params)}`)).notes,
    placeholderData: (previous) => previous,
    enabled: enabled && Boolean(workspaceId),
  });
}

// Creates when no id is given, updates otherwise.
export function useSaveQuickNote(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) => {
      const response = id
        ? await api.patch(`${basePath(workspaceId)}/${id}`, input)
        : await api.post(basePath(workspaceId), input);
      return response.note;
    },
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, [FEATURE]),
  });
}

export function useDeleteQuickNote(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => api.delete(`${basePath(workspaceId)}/${id}`),
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, [FEATURE]),
  });
}

// Ticks a to-do straight away and saves in the background; a failed save puts it back.
// input: { id, body (the text being shown), line (the to-do's line index) }
export function useToggleNoteTodo(workspaceId) {
  const queryClient = useQueryClient();
  const listKey = featureKey(workspaceId, FEATURE, 'list');

  function showBody(id, body) {
    queryClient.setQueriesData({ queryKey: listKey }, (notes) =>
      notes?.map((note) => (note.id === id ? { ...note, body } : note)),
    );
  }

  return useMutation({
    mutationFn: async ({ id, body, line }) =>
      (await api.patch(`${basePath(workspaceId)}/${id}`, { body: toggleCheckLine(body, line) }))
        .note,
    onMutate: async ({ id, body, line }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      showBody(id, toggleCheckLine(body, line));
      return { id, previous: body };
    },
    onError: (_error, _input, context) => context && showBody(context.id, context.previous),
    onSettled: () => invalidateFeatures(queryClient, workspaceId, [FEATURE]),
  });
}

// Saves as you type (sticky notes, the header panel). Puts the saved note
// straight into the lists instead of refetching them on every keystroke pause.
export function useAutosaveQuickNote(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) => {
      const response = id
        ? await api.patch(`${basePath(workspaceId)}/${id}`, input)
        : await api.post(basePath(workspaceId), input);
      return response.note;
    },
    onSuccess: (saved, { id }) => {
      if (!id) {
        // Show the new note at once in the full list, then refresh every list.
        queryClient.setQueryData(featureKey(workspaceId, FEATURE, 'list', {}), (notes) =>
          notes && !notes.some((note) => note.id === saved.id) ? [saved, ...notes] : notes,
        );
        invalidateFeatures(queryClient, workspaceId, [FEATURE]);
        return;
      }
      queryClient.setQueriesData({ queryKey: featureKey(workspaceId, FEATURE, 'list') }, (notes) =>
        notes?.map((note) => (note.id === saved.id ? saved : note)),
      );
    },
  });
}
