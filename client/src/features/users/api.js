import { api } from '../../lib/apiClient.js';

export const usersApi = {
  me: () => api.get('/users/me'),
  updateProfile: (input) => api.patch('/users/me', input),
  setAvatar: (image) => api.put('/users/me/avatar', { image }),
  clearAvatar: () => api.delete('/users/me/avatar'),
  changePassword: (input) => api.post('/users/me/password', input),
};
