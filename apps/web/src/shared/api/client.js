import axios from 'axios';

/**
 * Cliente HTTP.
 *
 * El access token vive en memoria y solo el refresh token se persiste. Así, un
 * XSS que lea localStorage no se lleva un token de acceso vigente, y la sesión
 * se puede revocar desde el servidor.
 *
 * Cuando el backend responde 401, el cliente intenta refrescar una sola vez y
 * reintenta la petición original de forma transparente.
 */

const REFRESH_STORAGE_KEY = 'otterly.refreshToken';

let accessToken = null;
let onSessionExpired = null;

export const tokenStore = {
  getAccess: () => accessToken,
  setAccess(token) {
    accessToken = token;
  },
  getRefresh: () => localStorage.getItem(REFRESH_STORAGE_KEY),
  setRefresh(token) {
    if (token) localStorage.setItem(REFRESH_STORAGE_KEY, token);
    else localStorage.removeItem(REFRESH_STORAGE_KEY);
  },
  clear() {
    accessToken = null;
    localStorage.removeItem(REFRESH_STORAGE_KEY);
  },
};

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Evita una tormenta de refrescos cuando varias peticiones fallan a la vez.
let refreshPromise = null;

async function refreshSession() {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) throw new Error('NO_REFRESH_TOKEN');

  const { data } = await axios.post(
    `${api.defaults.baseURL}/auth/refresh`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  );

  tokenStore.setAccess(data.accessToken);
  tokenStore.setRefresh(data.refreshToken);
  return data.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    const isRefreshCall = original?.url?.includes('/auth/refresh');
    const isLoginCall = original?.url?.includes('/auth/login');

    if (status === 401 && !original?._retried && !isRefreshCall && !isLoginCall) {
      original._retried = true;
      try {
        refreshPromise = refreshPromise ?? refreshSession();
        const token = await refreshPromise;
        refreshPromise = null;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        refreshPromise = null;
        tokenStore.clear();
        onSessionExpired?.();
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Extrae el mensaje que se le muestra a la persona.
 * El backend envía errores con forma { error: { code, message } }.
 */
export function errorMessage(error, fallback = 'Algo salió mal. Vuelve a intentarlo.') {
  const payload = error?.response?.data?.error;
  if (!payload) {
    if (error?.code === 'ECONNABORTED') return 'La conexión tardó demasiado.';
    if (!error?.response) return 'No pudimos conectar con el servidor.';
    return fallback;
  }
  if (payload.issues?.length) {
    return payload.issues.map((issue) => issue.message).join('. ');
  }
  return payload.message || fallback;
}

export function errorCode(error) {
  return error?.response?.data?.error?.code ?? null;
}

export default api;
