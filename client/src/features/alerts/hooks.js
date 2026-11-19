import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';

const ACTIVE_KEY = ['alerts', 'active'];
const SETTINGS_KEY = ['alerts', 'settings'];
const projectKey = (workspaceId, projectId) => ['alerts', 'project', workspaceId, projectId];

// Alerts ringing for me: { settings, quiet, alerts }. Checked often so the app
// rings even where push isn't set up; a push also triggers a check at once.
export function useActiveAlerts({ enabled = true } = {}) {
  return useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: () => api.get('/alerts/active'),
    enabled,
    refetchInterval: 20 * 1000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 5 * 1000,
  });
}

export function useRespondToAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, action }) => api.post(`/alerts/${alertId}/respond`, { action }),
    onMutate: ({ alertId }) => {
      // Gone from the popup right away.
      queryClient.setQueryData(ACTIVE_KEY, (old) =>
        old ? { ...old, alerts: old.alerts.filter((alert) => alert.id !== alertId) } : old,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ACTIVE_KEY });
      queryClient.invalidateQueries({ queryKey: ['alerts', 'project'] });
      queryClient.invalidateQueries({ queryKey: ['alerts', 'inbox'] });
    },
  });
}

// The project page was opened: its alerts stop ringing for me.
export async function markProjectOpened(queryClient, workspaceId, projectId) {
  const { answered } = await api.post(
    `/workspaces/${workspaceId}/alerts/projects/${projectId}/opened`,
  );
  if (answered > 0) {
    queryClient.setQueryData(ACTIVE_KEY, (old) =>
      old ? { ...old, alerts: old.alerts.filter((alert) => alert.projectId !== projectId) } : old,
    );
    queryClient.invalidateQueries({ queryKey: ['alerts', 'project'] });
    queryClient.invalidateQueries({ queryKey: ['alerts', 'inbox'] });
  }
}

export function useAlertSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => (await api.get('/alerts/settings')).settings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateAlertSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => (await api.patch('/alerts/settings', input)).settings,
    onMutate: (input) => {
      queryClient.setQueryData(SETTINGS_KEY, (old) =>
        old
          ? { ...old, ...input, quietHours: { ...old.quietHours, ...(input.quietHours ?? {}) } }
          : old,
      );
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(SETTINGS_KEY, settings);
      queryClient.setQueryData(ACTIVE_KEY, (old) => (old ? { ...old, settings } : old));
    },
    onError: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useProjectAlerts(workspaceId, projectId, { enabled = true } = {}) {
  return useQuery({
    queryKey: projectKey(workspaceId, projectId),
    queryFn: async () =>
      (await api.get(`/workspaces/${workspaceId}/alerts/projects/${projectId}`)).alerts,
    enabled,
    // Who has opened it updates while the dialog is open.
    refetchInterval: 15 * 1000,
  });
}

export function useSendAlert(workspaceId, projectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) =>
      (await api.post(`/workspaces/${workspaceId}/alerts/projects/${projectId}`, input)).alert,
    onSuccess: (alert, input) => {
      queryClient.invalidateQueries({ queryKey: projectKey(workspaceId, projectId) });
      queryClient.invalidateQueries({ queryKey: ['alerts', 'inbox', workspaceId] });
      if (input.test) queryClient.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

// My alerts in this workspace for the header's notifications list.
export function useAlertInbox(workspaceId) {
  return useQuery({
    queryKey: ['alerts', 'inbox', workspaceId],
    queryFn: async () => (await api.get(`/workspaces/${workspaceId}/alerts/inbox`)).alerts,
    refetchInterval: 30 * 1000,
    staleTime: 10 * 1000,
  });
}
