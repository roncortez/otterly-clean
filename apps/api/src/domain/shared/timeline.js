'use strict';

/**
 * Construye el timeline que ve el cliente.
 *
 * Requisito clave del producto: el cliente puede no estar en casa, asi que al
 * abrir la app debe entender de un vistazo que ya paso, que esta pasando ahora
 * y que falta. Por eso el timeline incluye los pasos futuros como pendientes,
 * no solo el historial.
 *
 *   ✓ Servicio solicitado
 *   ✓ Profesional asignado
 *   ● Limpieza en progreso   <- actual
 *   ○ Limpieza finalizada    <- pendiente
 */

/**
 * @param {object} params
 * @param {import('./stateMachine').StateMachine} params.stateMachine
 * @param {string} params.currentStatus
 * @param {Array<{to_status:string, created_at:Date, note:string}>} params.history
 * @returns {Array<{status,label,state:'DONE'|'CURRENT'|'PENDING'|'EXCEPTION',at,note}>}
 */
function buildTimeline({ stateMachine, currentStatus, history = [] }) {
  const happyPath = stateMachine.happyPath();

  // Ultimo timestamp registrado por estado.
  const reached = new Map();
  for (const entry of history) {
    reached.set(entry.to_status, entry);
  }

  const currentIndex = happyPath.indexOf(currentStatus);
  const isException = currentIndex === -1;

  const steps = happyPath.map((status, index) => {
    const entry = reached.get(status);
    let state;

    if (isException) {
      // En una rama excepcional, los pasos ya alcanzados siguen contando como
      // completados y el resto queda pendiente.
      state = entry ? 'DONE' : 'PENDING';
    } else if (index < currentIndex) {
      state = 'DONE';
    } else if (index === currentIndex) {
      state = stateMachine.isTerminal(status) ? 'DONE' : 'CURRENT';
    } else {
      state = 'PENDING';
    }

    return {
      status,
      label: stateMachine.states[status].label,
      state,
      at: entry?.created_at ?? null,
      note: entry?.note ?? null,
    };
  });

  // Los estados excepcionales (incidencia, sin acceso, cancelado) se insertan
  // como un paso propio al final para que el cliente los vea explicitamente.
  if (isException && stateMachine.hasState(currentStatus)) {
    const entry = reached.get(currentStatus);
    steps.push({
      status: currentStatus,
      label: stateMachine.states[currentStatus].label,
      state: 'EXCEPTION',
      at: entry?.created_at ?? null,
      note: entry?.note ?? null,
    });
  }

  return steps;
}

module.exports = { buildTimeline };
