import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';
import { openBoardAdder } from './boardBridge.js';

const FEATURE = 'moodboards';

function path(workspaceId, ...rest) {
  return [`/workspaces/${workspaceId}/moodboards`, ...rest].join('/');
}

export function boardKey(workspaceId, boardId) {
  return featureKey(workspaceId, FEATURE, 'board', boardId);
}

// params: { projectId }
export function useMoodboards(workspaceId, params = {}) {
  return useQuery({
    queryKey: featureKey(workspaceId, FEATURE, 'list', params),
    queryFn: async () => (await api.get(`${path(workspaceId)}${toQueryString(params)}`)).moodboards,
  });
}

export function useMoodboard(workspaceId, boardId) {
  return useQuery({
    queryKey: boardKey(workspaceId, boardId),
    queryFn: async () => (await api.get(path(workspaceId, boardId))).moodboard,
    // The editor holds the live copy; refetching under it would undo edits.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useCreateMoodboard(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => (await api.post(path(workspaceId), input)).moodboard,
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, [FEATURE]),
  });
}

export function useUpdateMoodboard(workspaceId, boardId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => (await api.patch(path(workspaceId, boardId), input)).moodboard,
    onSuccess: (board) => {
      queryClient.setQueryData(boardKey(workspaceId, boardId), (old) =>
        old
          ? { ...old, title: board.title, description: board.description, projects: board.projects }
          : board,
      );
      queryClient.invalidateQueries({ queryKey: featureKey(workspaceId, FEATURE, 'list') });
    },
  });
}

export function useDeleteMoodboard(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (boardId) => api.delete(path(workspaceId, boardId)),
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, [FEATURE]),
  });
}

export function saveCanvas(workspaceId, boardId, canvas) {
  return api.put(path(workspaceId, boardId, 'canvas'), canvas);
}

export async function fetchUploadFolder(workspaceId) {
  return (await api.post(path(workspaceId, 'upload-folder'))).folder;
}

// The AI's answers come back as the whole board (analysis and chat updated).
function useBoardAi(workspaceId, boardId, action) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) =>
      (await api.post(path(workspaceId, boardId, action), input)).moodboard,
    onSuccess: (board) => {
      queryClient.setQueryData(boardKey(workspaceId, boardId), (old) =>
        old ? { ...old, analysis: board.analysis, chat: board.chat } : board,
      );
      // Credits moved.
      queryClient.invalidateQueries({ queryKey: featureKey(workspaceId, 'ai') });
    },
  });
}

export function useAnalyseMoodboard(workspaceId, boardId) {
  return useBoardAi(workspaceId, boardId, 'analyse');
}

export function useAskMoodboard(workspaceId, boardId) {
  return useBoardAi(workspaceId, boardId, 'ask');
}

// Adds a sticky note with this text to a board: into the open editor when the
// board is on screen, otherwise on the server (the board reloads when opened).
export function useSendToMoodboard(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId, text }) => {
      const addLocally = openBoardAdder(boardId);
      if (addLocally) {
        addLocally(text);
        return { local: true };
      }
      return api.post(path(workspaceId, boardId, 'notes'), { text });
    },
    onSuccess: (result, { boardId }) => {
      if (result.local) return;
      queryClient.removeQueries({ queryKey: boardKey(workspaceId, boardId) });
      queryClient.invalidateQueries({ queryKey: featureKey(workspaceId, FEATURE, 'list') });
    },
  });
}

export function useSaveMoodboardNote(workspaceId, boardId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post(path(workspaceId, boardId, 'note'))).note,
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, ['quick-notes']),
  });
}
