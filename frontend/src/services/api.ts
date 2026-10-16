import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      if (path !== '/live' && !path.startsWith('/live') && path !== '/results' && !path.startsWith('/results') && path !== '/scoreboard' && !path.startsWith('/scoreboard')) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/** Unauthenticated client for public viewer */
export const publicApi = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;

export function getSocketUrl(): string {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  if (import.meta.env.VITE_API_URL) {
    return String(import.meta.env.VITE_API_URL).replace(/\/api\/?$/, '');
  }
  if (typeof window !== 'undefined' && window.location.origin.includes('localhost')) {
    return 'http://localhost:5000';
  }
  return window.location.origin;
}

/** Ping backend health (wakes Render free tier). */
export async function wakeBackend() {
  try {
    await fetch(`${getSocketUrl()}/api/health`, { method: 'GET', mode: 'cors' });
  } catch {
    /* ignore */
  }
}
