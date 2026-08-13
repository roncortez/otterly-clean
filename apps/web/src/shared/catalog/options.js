import { useMemo } from 'react';
import { useApiQuery } from '@/shared/api/useApiQuery';

/**
 * Opciones configurables que sirve el backend.
 *
 * Hoy solo fragancias, pero la forma es la misma para las que vengan: el
 * catálogo devuelve `{ code, label, description }` y la interfaz nunca inventa
 * la etiqueta.
 *
 * La orden guarda el **código**, no el texto que el cliente vio, para que
 * renombrar una opción no reescriba lo que se pidió hace seis meses. El precio
 * de eso es que al mostrar un detalle hay que traducir, y de eso se encarga
 * `useFragranceLabel`: sin él, el cliente leería «LAVENDER» en su reserva.
 */
export function useFragrances() {
  const { data, loading } = useApiQuery('/catalog/fragrances');

  return useMemo(() => {
    const fragrances = data?.fragrances ?? [];
    return {
      fragrances,
      loading,
      byCode: new Map(fragrances.map((option) => [option.code, option])),
    };
  }, [data, loading]);
}

/**
 * La etiqueta de una fragancia, o el código si el catálogo no la conoce.
 *
 * Devolver el código en bruto es feo pero honesto: pasa con una opción que
 * Operaciones retiró después de que alguien la pidiera, y con los valores de
 * texto libre anteriores a la migración 014 que no se pudieron normalizar.
 * Ocultarlo perdería información de una orden real.
 */
export function useFragranceLabel(code) {
  const { byCode } = useFragrances();
  if (!code) return null;
  return byCode.get(code)?.label ?? code;
}
