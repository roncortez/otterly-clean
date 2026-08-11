import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from './client';

/**
 * Lectura de datos de la API.
 *
 * Centraliza el patrón que antes se repetía en cada pantalla: pedir, descartar
 * la respuesta si el componente se desmontó, guardar un error legible y
 * exponer `reload` para refrescar tras una acción.
 *
 * `loading` se deriva comparando la consulta pedida con la ya resuelta, en
 * lugar de escribirse con un setState dentro del efecto. Así no hay renders en
 * cascada y el estado de carga nunca se queda desincronizado.
 *
 * @param {string|null} path        ruta relativa; null desactiva la consulta
 * @param {object} [options]
 * @param {object} [options.params] query params
 */
export function useApiQuery(path, { params } = {}) {
  // Identidad de la consulta actual. Cambiarla implica que los datos que
  // tenemos ya no corresponden y hay que volver a pedir.
  const paramsKey = JSON.stringify(params ?? {});
  const [nonce, setNonce] = useState(0);
  const queryKey = path ? `${path}|${paramsKey}|${nonce}` : null;

  const [resolved, setResolved] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    if (!queryKey) return undefined;

    let cancelled = false;

    // La primera operación es el await: no hay setState síncrono en el efecto.
    (async () => {
      try {
        const response = await api.get(path, { params: JSON.parse(paramsKey) });
        if (!cancelled) setResolved({ key: queryKey, data: response.data, error: null });
      } catch (error) {
        if (!cancelled) setResolved({ key: queryKey, data: null, error: errorMessage(error) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryKey, path, paramsKey]);

  const reload = useCallback(() => setNonce((current) => current + 1), []);

  return {
    data: resolved.key === queryKey ? resolved.data : null,
    error: resolved.key === queryKey ? resolved.error : null,
    // Cargando mientras lo resuelto no corresponda a lo pedido.
    loading: Boolean(queryKey) && resolved.key !== queryKey,
    reload,
  };
}

/**
 * Ejecuta una acción de escritura y expone su estado.
 * Evita repetir el trío try/catch/setBusy en cada botón.
 */
export function useApiAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (action, { onSuccess } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      await onSuccess?.(result);
      return { ok: true, result };
    } catch (requestError) {
      setError(errorMessage(requestError));
      return { ok: false, error: requestError };
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, execute };
}
