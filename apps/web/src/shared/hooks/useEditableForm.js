import { useCallback, useMemo, useState } from 'react';

/**
 * Formulario que edita datos ya cargados del servidor.
 *
 * El estado se **deriva durante el render** en lugar de copiarse con un efecto:
 * mientras nadie ha tocado nada, el formulario ES lo que llegó del servidor;
 * en cuanto se escribe algo, manda el borrador. Así no hay un instante en que
 * la pantalla muestre datos viejos ni renders en cascada, y un refresco de la
 * consulta no le pisa el texto a quien está escribiendo.
 *
 * @param {object|null} loaded  datos del servidor (null mientras carga)
 * @returns {{ form, dirty, changes, setField, setValue, reset }}
 */
export function useEditableForm(loaded) {
  const [draft, setDraft] = useState(null);

  const form = draft ?? loaded;

  // Solo lo que cambió respecto al servidor. Enviar únicamente esto evita
  // sobrescribir con valores obsoletos un campo que nadie tocó.
  const changes = useMemo(() => {
    if (!draft || !loaded) return {};
    return Object.fromEntries(
      Object.keys(draft).filter((key) => draft[key] !== loaded[key]).map((key) => [key, draft[key]]),
    );
  }, [draft, loaded]);

  const dirty = Object.keys(changes).length > 0;

  const setValue = useCallback(
    (key, value) => setDraft((current) => ({ ...(current ?? loaded ?? {}), [key]: value })),
    [loaded],
  );

  /** Manejador listo para `onChange` de un input controlado. */
  const setField = useCallback(
    (key) => (event) => setValue(key, event.target.value),
    [setValue],
  );

  /** Vuelve a lo que hay en el servidor. También se llama tras guardar. */
  const reset = useCallback(() => setDraft(null), []);

  return { form, dirty, changes, setField, setValue, reset };
}
