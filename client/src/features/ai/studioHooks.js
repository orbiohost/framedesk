import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { aiKey } from './hooks.js';

// The AI studio: custom assistants, skills and memory.

const base = (workspaceId) => `/workspaces/${workspaceId}/ai`;

export function useAiAgents(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: aiKey(workspaceId, 'agents'),
    queryFn: async () => (await api.get(`${base(workspaceId)}/agents`)).agents,
    enabled: enabled && Boolean(workspaceId),
    staleTime: 60 * 1000,
  });
}

export function useSaveAgent(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) =>
      (id
        ? await api.patch(`${base(workspaceId)}/agents/${id}`, input)
        : await api.post(`${base(workspaceId)}/agents`, input)
      ).agent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKey(workspaceId, 'agents') }),
  });
}

export function useDeleteAgent(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId) => api.delete(`${base(workspaceId)}/agents/${agentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKey(workspaceId, 'agents') });
      queryClient.invalidateQueries({ queryKey: aiKey(workspaceId, 'memory') });
    },
  });
}

export function useAiSkills(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: aiKey(workspaceId, 'skills'),
    queryFn: async () => (await api.get(`${base(workspaceId)}/skills`)).skills,
    enabled: enabled && Boolean(workspaceId),
    staleTime: 60 * 1000,
  });
}

export function useSaveSkill(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }) =>
      (id
        ? await api.patch(`${base(workspaceId)}/skills/${id}`, input)
        : await api.post(`${base(workspaceId)}/skills`, input)
      ).skill,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKey(workspaceId, 'skills') }),
  });
}

export function useDeleteSkill(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skillId) => api.delete(`${base(workspaceId)}/skills/${skillId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKey(workspaceId, 'skills') }),
  });
}

export function useAiMemory(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: aiKey(workspaceId, 'memory'),
    queryFn: () => api.get(`${base(workspaceId)}/memory`),
    enabled: enabled && Boolean(workspaceId),
  });
}

function useMemoryMutation(workspaceId, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKey(workspaceId, 'memory') }),
  });
}

export function useAddMemory(workspaceId) {
  return useMemoryMutation(workspaceId, (input) => api.post(`${base(workspaceId)}/memory`, input));
}

export function useUpdateMemory(workspaceId) {
  return useMemoryMutation(workspaceId, ({ id, text }) =>
    api.patch(`${base(workspaceId)}/memory/${id}`, { text }),
  );
}

export function useDeleteMemory(workspaceId) {
  return useMemoryMutation(workspaceId, (id) => api.delete(`${base(workspaceId)}/memory/${id}`));
}

export function useClearMemory(workspaceId) {
  return useMemoryMutation(workspaceId, (input = {}) =>
    api.post(`${base(workspaceId)}/memory/clear`, input),
  );
}

export function useMemoryPreferences(workspaceId) {
  return useMemoryMutation(workspaceId, (changes) =>
    api.patch(`${base(workspaceId)}/memory/preferences`, changes),
  );
}

// "Generate with AI" / "Improve with AI": { request, base? } → { draft, credits }.
export function useGenerateSkill(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.post(`${base(workspaceId)}/skills/generate`, input),
    onSuccess: (data) =>
      queryClient.setQueryData(aiKey(workspaceId, 'status'), (current) =>
        current ? { ...current, credits: data.credits } : current,
      ),
  });
}

// "Test it": { name, instructions, example, input } → { output, credits }.
export function useTestSkill(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.post(`${base(workspaceId)}/skills/test`, input),
    onSuccess: (data) =>
      queryClient.setQueryData(aiKey(workspaceId, 'status'), (current) =>
        current ? { ...current, credits: data.credits } : current,
      ),
  });
}

// Adds several skills (an import), one after another. Returns { created, failed }.
export function useImportSkills(workspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (skills) => {
      let created = 0;
      const failed = [];
      for (const skill of skills) {
        try {
          await api.post(`${base(workspaceId)}/skills`, skill);
          created += 1;
        } catch (error) {
          failed.push(`${skill.name || 'Untitled'}: ${error.message}`);
        }
      }
      return { created, failed };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: aiKey(workspaceId, 'skills') }),
  });
}
