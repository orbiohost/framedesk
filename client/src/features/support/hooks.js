import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';

// Support tickets belong to the person, not a workspace, so the key is global.
const myTicketsKey = ['support', 'tickets'];
const adminTicketsKey = (filters) => ['admin', 'support', filters];

export function useMyTickets() {
  return useQuery({
    queryKey: myTicketsKey,
    queryFn: async () => (await api.get('/support/tickets')).tickets,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ticket) => (await api.post('/support/tickets', ticket)).ticket,
    onSuccess: (ticket) => {
      queryClient.setQueryData(myTicketsKey, (current) => [ticket, ...(current ?? [])]);
    },
  });
}

export function useAdminTickets(filters) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const query = params.size ? `?${params}` : '';
  return useQuery({
    queryKey: adminTicketsKey(filters),
    queryFn: async () => (await api.get(`/admin/support${query}`)).tickets,
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...change }) =>
      (await api.patch(`/admin/support/${id}`, change)).ticket,
    // The list filters and the open-ticket badge on the admin menu both move.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}
