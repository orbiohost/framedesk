import { api } from '../../lib/apiClient.js';

export const usersApi = {
  me: () => api.get('/users/me'),
  updateProfile: (input) => api.patch('/users/me', input),
  setAvatar: (image) => api.put('/users/me/avatar', { image }),
  clearAvatar: () => api.delete('/users/me/avatar'),
  changePassword: (input) => api.post('/users/me/password', input),
  updateBillingProfile: (input) => api.put('/users/me/billing-profile', input),
  billing: () => api.get('/users/me/billing'),
  invoicePdf: (paymentId) => api.getBlob(`/users/me/billing/invoices/${paymentId}/pdf`),
};
