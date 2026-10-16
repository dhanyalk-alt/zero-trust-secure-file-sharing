import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

// Request interceptor to attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor to handle session expiration or revocation
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Don't auto-redirect on failed login attempt itself
      if (!error.config.url.includes('/auth/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  registerKeys: (keys) => api.post('/auth/keys', keys),
  updateProfile: (data) => api.patch('/auth/profile', data),
  changePassword: (data) => api.post('/auth/change-password', data),
  createEncryptionKeyChallenge: () => api.post('/auth/keys/encryption-challenge'),
  verifyEncryptionKey: (data) => api.post('/auth/keys/verify-encryption', data),
};

export const filesAPI = {
  upload: (formData) => api.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getMyFiles: (params) => api.get('/files/my-files', { params }),
  getSharedWithMe: (params) => api.get('/files/shared-with-me', { params }),
  getMetadata: (fileId) => api.get(`/files/${fileId}/metadata`),
  verifyIntegrity: (fileId) => api.get(`/files/${fileId}/verify`),
  download: (fileId, privateKeyPem) => {
    const formData = new FormData();
    formData.append('private_key_pem', privateKeyPem);
    return api.post(`/files/${fileId}/download`, formData, {
      responseType: 'blob'
    });
  },
  preview: (fileId, privateKeyPem) => {
    const formData = new FormData();
    formData.append('private_key_pem', privateKeyPem);
    return api.post(`/files/${fileId}/preview`, formData, { responseType: 'blob' });
  },
  setExpiry: (fileId, data) => api.patch(`/files/${fileId}/expiry`, data),
  deleteFile: (fileId) => api.delete(`/files/${fileId}`),
  getCategories: () => api.get('/files/categories'),
  createCategory: (data) => api.post('/files/categories', data),
  updateCategory: (categoryId, data) => api.patch(`/files/categories/${categoryId}`, data),
  deleteCategory: (categoryId) => api.delete(`/files/categories/${categoryId}`),
  moveFileCategory: (fileId, data) => api.patch(`/files/${fileId}/category`, data),
};

export const permissionsAPI = {
  shareFile: (fileId, data, ownerPrivateKey) => api.post(`/files/${fileId}/share`, data, {
    headers: { 'X-Owner-Private-Key': ownerPrivateKey }
  }),
  getPermissions: (fileId) => api.get(`/files/${fileId}/permissions`),
  revokePermission: (fileId, recipientId) => api.post(`/files/${fileId}/permissions/${recipientId}/revoke`),
  updatePermission: (fileId, recipientId, data) => api.patch(`/files/${fileId}/permissions/${recipientId}`, data),
  setTemporalWindow: (fileId, recipientId, data) => api.patch(`/files/${fileId}/permissions/${recipientId}/window`, data),
};

export const usersAPI = {
  search: (query) => api.get(`/users/search?q=${encodeURIComponent(query)}`),
  getPublicKeys: (userId) => api.get(`/users/${userId}/public-keys`),
};

export const auditAPI = {
  getLogs: (params) => api.get('/audit/logs', { params }),
  getSecuritySummary: () => api.get('/audit/security-summary'),
  verifyChain: () => api.get('/audit/chain-verify'),
};

export const statsAPI = {
  getDashboard: () => api.get('/stats/dashboard'),
};

export const organizationsAPI = {
  list: () => api.get('/organizations'),
  create: (data) => api.post('/organizations', data),
  get: (organizationId) => api.get(`/organizations/${organizationId}`),
  getMembers: (organizationId) => api.get(`/organizations/${organizationId}/members`),
  addMember: (organizationId, data) => api.post(`/organizations/${organizationId}/members`, data),
  removeMember: (organizationId, userId) => api.delete(`/organizations/${organizationId}/members/${userId}`),
  getFiles: (organizationId) => api.get(`/organizations/${organizationId}/files`),
  uploadFiles: (organizationId, data) => api.post(`/organizations/${organizationId}/files`, data),
  deleteOrganization: (organizationId) => api.delete(`/organizations/${organizationId}`),
  deleteFile: (organizationId, fileId) => api.delete(`/organizations/${organizationId}/files/${fileId}`),
  getActivity: (organizationId, limit = 100) => api.get(`/organizations/${organizationId}/activity?limit=${limit}`),
  getFileActivity: (organizationId, fileId) => api.get(`/organizations/${organizationId}/files/${fileId}/activity`),
};

export const adminAPI = {
  getSystemStats: () => api.get('/admin/system-stats'),
  listUsers: (params) => api.get('/admin/users', { params }),
  updateUser: (userId, data) => api.patch(`/admin/users/${userId}`, data),
  listFiles: (params) => api.get('/admin/files', { params }),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
};

export const analyticsAPI = {
  getSummary: () => api.get('/files/analytics/summary'),
  getFileAnalytics: (fileId) => api.get(`/files/${fileId}/analytics`),
};

export const signaturesAPI = {
  sign: (fileId, data) => api.post(`/files/${fileId}/sign`, data),
  list: (fileId) => api.get(`/files/${fileId}/signatures`),
  verify: (fileId, sigId) => api.get(`/files/${fileId}/signatures/${sigId}/verify`),
};

export const shareLinksAPI = {
  create: (fileId, data) => api.post(`/files/${fileId}/share-links`, data),
  list: (fileId) => api.get(`/files/${fileId}/share-links`),
  revoke: (fileId, linkId) => api.delete(`/files/${fileId}/share-links/${linkId}`),
  // Public endpoints (no Authorization header required)
  getPublicInfo: (token) => axios.get(`/api/share/${token}`),
  downloadPublic: (token) => `/api/share/${token}/download`,
};

export const subscriptionAPI = {
  getStatus: () => api.get('/subscription/status'),
  createOrder: (data) => api.post('/subscription/create-order', data),
  verifyPayment: (data) => api.post('/subscription/verify-payment', data),
};

export default api;
