/**
 * Cuántos pasos del timeline se ven a la vez, y cuáles.
 *
 * Es una decisión de producto, no de dibujo, así que vive aparte del componente
 * y se puede probar sola: una limpieza tiene ocho estados, y ocho puntos en
 * vertical dejan de leerse de un vistazo —se vuelven un documento—. Con cinco
 * cabe en una pantalla de móvil sin desplazar.
 */
export const MAX_VISIBLE_STEPS = 5;

/**
 * Los pasos que se muestran, alrededor del actual.
 *
 * Lo que no se puede perder nunca es dónde está el servicio ahora, así que la
 * ventana se centra ahí y no en el principio de la lista: al empezar se ven los
 * primeros, y con el servicio avanzado se ve lo que acaba de pasar y lo que
 * queda. Se deja un paso completado por delante —el anterior— porque "de dónde
 * vengo" es parte de entender dónde estoy.
 *
 * Devuelve también cuántos quedan fuera a cada lado: es lo que permite decir que
 * la lista continúa en lugar de recortarla en silencio.
 *
 * @param {Array<{state:'DONE'|'CURRENT'|'PENDING'|'EXCEPTION'}>} steps
 * @param {number|null} max  null o 0 = sin límite, se ven todos
 */
export function timelineWindow(steps = [], max = MAX_VISIBLE_STEPS) {
  if (!max || steps.length <= max) {
    return { visible: steps, before: 0, after: 0 };
  }

  const currentIndex = steps.findIndex(
    (step) => step.state === 'CURRENT' || step.state === 'EXCEPTION',
  );
  // Sin paso actual (terminado o cancelado) interesa el final: es donde acabó.
  const anchor = currentIndex === -1 ? steps.length - 1 : currentIndex;

  const start = Math.min(Math.max(anchor - 1, 0), steps.length - max);

  return {
    visible: steps.slice(start, start + max),
    before: start,
    after: steps.length - (start + max),
  };
}
