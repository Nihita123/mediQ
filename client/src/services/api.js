/**
 * services/api.js — Axios instance and service modules
 *
 * All API calls go through this file. The JWT token is attached
 * automatically via a request interceptor.
 */

import axios from 'axios';

// ─── Axios Instance ───────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60s — LLM responses can be slow
});

// Attach JWT to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('mediq_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle global 401 — clear session and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('mediq_token');
      localStorage.removeItem('mediq_user');
      // Redirect only if not already on a public page
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth Service ─────────────────────────────────────────────────────────────

export const authService = {
  register: (data) => api.post('/auth/register', data).then((r) => r.data),
  login: (data) => api.post('/auth/login', data).then((r) => r.data),
  getMe: () => api.get('/auth/me').then((r) => r.data),
  updateProfile: (data) => api.put('/auth/profile', data).then((r) => r.data),
};

// ─── Session Service ──────────────────────────────────────────────────────────

export const sessionService = {
  create: () => api.post('/session/create').then((r) => r.data),
  getHistory: (params) => api.get('/session/history', { params }).then((r) => r.data),
  getById: (id) => api.get(`/session/${id}`).then((r) => r.data),
  update: (id, data) => api.put(`/session/${id}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/session/${id}`).then((r) => r.data),
};

// ─── Report Service ───────────────────────────────────────────────────────────

export const reportService = {
  create: (data) => api.post('/report/create', data).then((r) => r.data),
  getById: (id) => api.get(`/report/${id}`).then((r) => r.data),
  getByPatient: (patientId) => api.get(`/report/patient/${patientId}`).then((r) => r.data),
};

// ─── Triage Service ───────────────────────────────────────────────────────────

export const triageService = {
  /** Create a new session and get the opening AI greeting */
  start: () => api.post('/triage/start').then((r) => r.data),

  /** Send a patient message; returns AI reply + updated session state */
  sendMessage: (sessionId, message) =>
    api.post('/triage/message', { sessionId, message }).then((r) => r.data),

  /** Retrieve a full session by ID */
  getSession: (sessionId) => api.get(`/triage/${sessionId}`).then((r) => r.data),

  /** Paginated session history */
  getHistory: (params) => api.get('/triage/history', { params }).then((r) => r.data),
};

export default api;
