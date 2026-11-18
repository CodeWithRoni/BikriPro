import axios from 'axios';

/**
 * Server address resolution (works for web, Electron and Capacitor):
 *  1. user-set address saved on this device (Login → Server settings)
 *  2. VITE_API_URL at build time
 *  3. same origin (when the backend also serves the web app) / Vite proxy in dev
 */
export function getServerUrl() {
  try {
    const saved = localStorage.getItem('bp_server_url');
    if (saved) return saved.replace(/\/+$/, '');
  } catch { /* ignore */ }
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && /^https?:/.test(window.location.protocol)) return '';
  return 'http://localhost:5000';
}

export function setServerUrl(url) {
  if (url) localStorage.setItem('bp_server_url', url.trim().replace(/\/+$/, ''));
  else localStorage.removeItem('bp_server_url');
  api.defaults.baseURL = `${getServerUrl()}/api`;
}

/** Turn a stored path like /uploads/products/x.webp into a full URL. */
export const fileUrl = (p) => (!p ? null : /^https?:/.test(p) ? p : `${getServerUrl()}${p}`);

const api = axios.create({ baseURL: `${getServerUrl()}/api`, timeout: 30000 });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('bp_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) onUnauthorized?.();
    const message = err.response?.data?.message
      || (err.code === 'ERR_NETWORK' ? 'Cannot reach the BikriPro server. Check the server address / network.' : err.message);
    return Promise.reject(Object.assign(err, { message }));
  }
);

export default api;
