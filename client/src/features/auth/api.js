import { api } from '../../lib/apiClient.js';

export const authApi = {
  signup: (input) => api.post('/auth/signup', input),
  login: (input) => api.post('/auth/login', input),
  logout: () => api.post('/auth/logout'),
  logoutEverywhere: () => api.post('/auth/logout-all'),
  verifyEmail: (token) => api.post('/auth/verify-email', { token }),
  resendVerification: () => api.post('/auth/verify-email/resend'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (input) => api.post('/auth/reset-password', input),
};
