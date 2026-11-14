import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';

export const connectorsApi = {
  list: () => api.get('/connectors'),
  createKey: (input) => api.post('/connectors/keys', input),
  updateWorkspaces: ({ id, ...input }) => api.patch(`/connectors/${id}`, input),
  revoke: (id) => api.delete(`/connectors/${id}`),
  describeAuthorization: (params) => api.get(`/connectors/authorize${toQueryString(params)}`),
  decideAuthorization: (input) => api.post('/connectors/authorize', input),
};
