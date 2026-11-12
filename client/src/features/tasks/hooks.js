import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey, invalidateFeatures } from '../../lib/workspaceKeys.js';

// Task changes also move project progress and calendar due dates.
const AFFECTED_FEATURES = ['tasks', 'projects', 'calendar'];

function basePath(workspaceId) {
  return `/workspaces/${workspaceId}/tasks`;
}

function listKey(workspaceId, params) {
  return featureKey(workspaceId, 'tasks', 'list', params);
}

export function useTasks(workspaceId, params = {}, options = {}) {
  return useQuery({
    queryKey: listKey(workspaceId, params),
    queryFn: async () => (await api.get(`${basePath(workspaceId)}${toQueryString(params)}`)).tasks,
    ...options,
  });
}

// Creates when no id is given, updates otherwise.
export function useSaveTask(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) => {
      const response = id
        ? await api.patch(`${basePath(workspaceId)}/${id}`, input)
        : await api.post(basePath(workspaceId), input);
      return response.task;
    },
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, AFFECTED_FEATURES),
  });
}

export function useDeleteTask(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId) => api.delete(`${basePath(workspaceId)}/${taskId}`),
    onSuccess: () => invalidateFeatures(queryClient, workspaceId, AFFECTED_FEATURES),
  });
}

function applyMove(tasks, taskId, change) {
  return tasks?.map((task) => (task.id === taskId ? { ...task, ...change } : task));
}

// Board moves and done-toggles update the cached lists straight away,
// then roll back if the server refuses.
export function useMoveTask(workspaceId) {
  const queryClient = useQueryClient();
  const tasksKey = featureKey(workspaceId, 'tasks');

  return useMutation({
    mutationFn: ({ taskId, change }) => api.patch(`${basePath(workspaceId)}/${taskId}`, change),
    onMutate: async ({ taskId, change }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey });
      const snapshots = queryClient.getQueriesData({ queryKey: tasksKey });
      queryClient.setQueriesData({ queryKey: tasksKey }, (tasks) =>
        applyMove(tasks, taskId, change),
      );
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => invalidateFeatures(queryClient, workspaceId, AFFECTED_FEATURES),
  });
}
