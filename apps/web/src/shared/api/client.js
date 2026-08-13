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

/**
 * Distingue "la sesión terminó" de "no pudimos preguntar".
 *
 * Solo el servidor puede decir que una sesión dejó de valer. Un servidor caído,
 * un timeout o el wifi del ascensor no son motivo para borrar el refresh token:
 * hacerlo obligaba a volver a iniciar sesión por un fallo de red de dos
 * segundos.
 */
function isSessionRejected(error) {
  const status = error?.response?.status;
  return status === 401 || status === 403;
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

/**
 * Refresco de sesión, uno a la vez.
 *
 * La promesa vive en el módulo, no en un componente: es lo que hace que dos
 * peticiones que reciben 401 a la vez —o el efecto de arranque de React, que en
 * modo estricto se ejecuta dos veces— compartan una sola llamada. Cada refresco
 * rota el token en el servidor, así que dos llamadas en paralelo con el mismo
 * token acababan con una de las dos recibiendo "sesión expirada" y cerrando la
 * sesión de alguien que acababa de recargar la página.
 */
let refreshPromise = null;

export function refreshSession() {
  refreshPromise =
    refreshPromise ??
    (async () => {
      const refreshToken = tokenStore.getRefresh();
      if (!refreshToken) {
        const error = new Error('NO_REFRESH_TOKEN');
        error.code = 'NO_REFRESH_TOKEN';
        throw error;
      }

      const { data } = await axios.post(
        `${api.defaults.baseURL}/auth/refresh`,
        { refreshToken },
        { headers: { 'Content-Type': 'application/json' } },
      );

      tokenStore.setAccess(data.accessToken);
      tokenStore.setRefresh(data.refreshToken);
      return data;
    })().finally(() => {
      // Se libera cuando la llamada termina, no antes: si se limpiara al
      // resolver el primer `await`, una tercera petición arrancaría otro
      // refresco con el token que se acaba de rotar.
      refreshPromise = null;
    });

  return refreshPromise;
}

/** Cierra la sesión local. Solo cuando el servidor dice que ya no vale. */
function endSession() {
  tokenStore.clear();
  onSessionExpired?.();
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
        const session = await refreshSession();
        original.headers.Authorization = `Bearer ${session.accessToken}`;
        return api(original);
      } catch (refreshError) {
        // Sin token guardado o con el servidor diciendo que no vale, la sesión
        // termina. Si solo falló la red, se conserva: reintentar más tarde
        // tiene que ser posible sin volver a escribir la contraseña.
        if (refreshError?.code === 'NO_REFRESH_TOKEN' || isSessionRejected(refreshError)) {
          endSession();
        }
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Sube un archivo.
 *
 * Existe como función propia por un detalle fácil de olvidar: la instancia de
 * axios declara `Content-Type: application/json`, y con ese encabezado axios
 * **convierte el FormData a JSON** y el archivo se pierde en silencio. Al
 * indicar `multipart/form-data` axios respeta el FormData, y el adaptador del
 * navegador reemplaza el encabezado por uno con el `boundary` correcto.
 *
 * @param {string} path        ruta relativa
 * @param {File} file          archivo a subir
 * @param {object} [options]
 * @param {string} [options.field]      nombre del campo (por defecto `image`)
 * @param {Function} [options.onProgress] recibe el porcentaje subido (0-100)
 */
export function uploadFile(path, file, { field = 'image', onProgress } = {}) {
  const form = new FormData();
  form.append(field, file);

  return api.post(path, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
      ? (event) => {
          if (event.total) onProgress(Math.round((event.loaded * 100) / event.total));
        }
      : undefined,
  });
}

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

export { isSessionRejected };

export default api;
