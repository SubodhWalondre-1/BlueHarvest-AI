/**
 * BlueHarvest API client.
 * Local by default; set VITE_API_URL to intentionally target another environment.
 * Access tokens are held in memory/sessionStorage, while the refresh token is an
 * HttpOnly cookie issued by FastAPI.
 */

const ACCESS_TOKEN_KEY = 'bh_access_token';
const CSRF_HEADERS = { 'X-CSRF-Protection': '1' };
let accessToken = null;

export const getApiBaseUrl = () => {
  const envUrl = import.meta.env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const trimmed = envUrl.trim().replace(/\/+$/, '');
    if (typeof window !== 'undefined') {
      try {
        const parsed = new URL(trimmed, window.location.origin);
        if (
          (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ) {
          parsed.hostname = window.location.hostname;
          return parsed.origin;
        }
      } catch {
        // use trimmed
      }
    }
    return trimmed;
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `http://${host || 'localhost'}:8000`;
};

const getStoredToken = () => {
  if (accessToken) return accessToken;
  try {
    accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    accessToken = null;
  }
  return accessToken;
};

export const setAccessToken = (token) => {
  accessToken = token || null;
  try {
    if (accessToken) sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // In-memory auth still works for the current page if browser storage is unavailable.
  }
};

export const clearAccessToken = () => setAccessToken(null);

let refreshPromise = null;

async function requestTokenRefresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: CSRF_HEADERS,
      });
      if (!response.ok) {
        clearAccessToken();
        return null;
      }
      const data = await response.json();
      setAccessToken(data.access_token);
      return data.access_token;
    } catch {
      clearAccessToken();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function parseError(response, fallback) {
  let message = `${fallback} (HTTP ${response.status})`;
  let code = null;
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (detail && typeof detail === 'object') {
      message = detail.message || JSON.stringify(detail);
      code = detail.code || null;
    } else if (typeof detail === 'string') {
      message = detail;
    } else if (body?.message) {
      message = body.message;
    }
  } catch {
    // The server may return a non-JSON error page.
  }
  const error = new Error(message);
  error.status = response.status;
  error.code = code;
  throw error;
}

export async function apiRequest(path, options = {}) {
  const { auth = true, _retry = false, responseType = 'json', ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  if (path === '/api/auth/refresh' || path === '/api/auth/logout') {
    headers.set('X-CSRF-Protection', CSRF_HEADERS['X-CSRF-Protection']);
  }
  if (auth) {
    const token = getStoredToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && auth && !_retry && path !== '/api/auth/refresh' && path !== '/api/auth/login') {
    const refreshedToken = await requestTokenRefresh();
    if (refreshedToken) {
      return apiRequest(path, { ...options, _retry: true });
    }
  }

  if (!response.ok) await parseError(response, 'BlueHarvest API request failed');
  if (response.status === 204) return null;
  return responseType === 'blob' ? response.blob() : response.json();
}

export function getPrivateImagePath(source) {
  if (typeof source !== 'string') return null;
  const base = getApiBaseUrl();
  const path = source.startsWith(base) ? source.slice(base.length) : source;
  return /^\/api\/uploads\/[a-f0-9]{32}\.(jpg|png|webp|bmp|tiff)$/.test(path) ? path : null;
}

export async function fetchUploadedImage(source, { signal } = {}) {
  const path = getPrivateImagePath(source);
  if (!path) throw new Error('Invalid private image URL.');
  return apiRequest(path, { signal, responseType: 'blob', cache: 'no-store', redirect: 'error' });
}

function jsonBody(value) {
  return JSON.stringify(value);
}

export async function loginUser({ username, password }) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST', auth: false,
    body: jsonBody({ username, password }),
  });
  setAccessToken(data.access_token);
  return data;
}

export async function signupUser(payload) {
  const data = await apiRequest('/api/auth/signup', {
    method: 'POST', auth: false,
    body: jsonBody({
      full_name: payload.fullName,
      username: payload.username,
      email: payload.email,
      phone: payload.phone || null,
      pond_location: payload.pondLocation,
      password: payload.password,
    }),
  });
  setAccessToken(data.access_token);
  return data;
}

export async function loginWithGoogleCredential(credential) {
  const data = await apiRequest('/api/auth/google', {
    method: 'POST', auth: false,
    body: jsonBody({ credential }),
  });
  setAccessToken(data.access_token);
  return data;
}

export async function logoutUser() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    clearAccessToken();
  }
}

export async function restoreAuthSession() {
  try {
    const current = await apiRequest('/api/auth/me');
    return current.user || null;
  } catch (error) {
    if (error.status !== 401) return null;
  }
  try {
    const data = await apiRequest('/api/auth/refresh', { method: 'POST', auth: false });
    setAccessToken(data.access_token);
    return data.user || null;
  } catch {
    clearAccessToken();
    return null;
  }
}

export async function requestPasswordReset(destination) {
  return apiRequest('/api/auth/password-reset/request', {
    method: 'POST', auth: false, body: jsonBody({ destination }),
  });
}

export async function verifyPasswordReset(destination, code) {
  return apiRequest('/api/auth/password-reset/verify', {
    method: 'POST', auth: false, body: jsonBody({ destination, code }),
  });
}

export async function confirmPasswordReset(destination, resetToken, newPassword) {
  return apiRequest('/api/auth/password-reset/confirm', {
    method: 'POST', auth: false,
    body: jsonBody({ destination, reset_token: resetToken, new_password: newPassword }),
  });
}

export async function getCurrentUser() {
  const data = await apiRequest('/api/users/me');
  return data.user;
}

export async function updateProfile(payload) {
  return apiRequest('/api/users/me', {
    method: 'PATCH',
    body: jsonBody({
      username: payload.username,
      display_role: payload.role,
      full_name: payload.fullName,
      email: payload.email,
      phone: payload.phone || null,
      pond_location: payload.pondLocation,
    }),
  });
}

export async function getUserSettings() {
  const data = await apiRequest('/api/users/me/settings');
  return data.settings;
}

export async function requestContactChange({ channel, value, password }) {
  return apiRequest('/api/users/me/contact-change/request', {
    method: 'POST', body: jsonBody({ channel, value, password }),
  });
}

export async function confirmContactChange({ challengeId, code, password }) {
  return apiRequest('/api/users/me/contact-change/confirm', {
    method: 'POST', body: jsonBody({ challenge_id: challengeId, code, password }),
  });
}

export async function updateUserSettings(payload) {
  const data = await apiRequest('/api/users/me/settings', {
    method: 'PATCH',
    body: jsonBody({
      notifications_enabled: payload.notificationsEnabled,
      language: payload.language,
      theme: payload.theme,
    }),
  });
  return data.settings;
}

export async function listCountSessions({ includeDemo = false, includeUnsaved = false } = {}) {
  const params = new URLSearchParams({ include_demo: String(includeDemo), include_unsaved: String(includeUnsaved) });
  const data = await apiRequest(`/api/count-sessions?${params.toString()}`);
  return data.items || [];
}

export async function saveCountSession(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('A backend inference session is required to save this result.');
  }
  const data = await apiRequest('/api/count-sessions', {
    method: 'POST', body: jsonBody({ session_id: sessionId }),
  });
  return data.session;
}

export async function deleteCountSession(sessionId) {
  return apiRequest(`/api/count-sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export async function getDashboardSummary(range = 'today', includeDemo = false) {
  const params = new URLSearchParams({ range, include_demo: String(includeDemo) });
  return apiRequest(`/api/dashboard/summary?${params.toString()}`);
}

export async function getNotifications() {
  const data = await apiRequest('/api/notifications');
  return data.items || [];
}

export async function markNotificationRead(notificationId) {
  return apiRequest(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' });
}

export async function getDemoStatus() {
  return apiRequest('/api/demo/status');
}

export async function processImage(imageFile, source = 'Uploaded') {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('source', source);
  return apiRequest('/api/image-processing', { method: 'POST', body: formData });
}

export async function preprocessImage(imageFile) {
  const formData = new FormData();
  formData.append('file', imageFile);
  return apiRequest('/api/preprocess-image', { method: 'POST', body: formData });
}

export async function getDiagnostics() {
  return apiRequest('/api/diagnostics', { auth: false });
}

export default {
  getApiBaseUrl,
  apiRequest,
  fetchUploadedImage,
  loginUser,
  signupUser,
  loginWithGoogleCredential,
  logoutUser,
  restoreAuthSession,
  requestPasswordReset,
  verifyPasswordReset,
  confirmPasswordReset,
  getCurrentUser,
  updateProfile,
  requestContactChange,
  confirmContactChange,
  getUserSettings,
  updateUserSettings,
  listCountSessions,
  saveCountSession,
  deleteCountSession,
  getDashboardSummary,
  getNotifications,
  markNotificationRead,
  getDemoStatus,
  processImage,
  preprocessImage,
  getDiagnostics,
};
