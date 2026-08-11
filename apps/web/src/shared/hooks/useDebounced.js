import { useEffect, useState } from 'react';

/**
 * Retrasa la propagación de un valor.
 * Se usa en los buscadores para no lanzar una consulta por cada tecla.
 */
export function useDebounced(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
