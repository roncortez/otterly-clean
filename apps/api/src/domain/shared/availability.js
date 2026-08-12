'use strict';

const { DomainError } = require('../errors');

/**
 * Disponibilidad comercial de la plataforma.
 *
 * Responde a una pregunta distinta de la de `staff_availability`:
 *
 *   staff_availability  ->  "¿cuando puede trabajar Carla?"
 *   booking_blackouts   ->  "¿cuando acepta reservas la empresa?"
 *
 * Son dos cosas que se parecen y no deben mezclarse: cerrar el 25 de diciembre
 * no cambia el horario de nadie, y que Carla libre el martes no cierra la
 * agenda.
 *
 * Logica pura: recibe los bloqueos ya leidos y devuelve un veredicto. No sabe
 * que existe una base de datos.
 */

/** Convierte a Date lo que puede llegar como Date (pg) o como cadena (JSON). */
function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

/**
 * ¿Se solapan dos intervalos?
 *
 * Se comparan con extremos abiertos a proposito: un bloqueo de 14:00 a 17:00 y
 * un servicio de 17:00 a 20:00 NO chocan. Si se usara `<=` se perderia una
 * franja util en cada frontera.
 */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

/** Un bloqueo sin service_type es global: afecta a todos los servicios. */
function appliesToService(blackout, serviceType) {
  return !blackout.service_type || blackout.service_type === serviceType;
}

/**
 * Primer bloqueo vivo que impide reservar el intervalo pedido, o null.
 *
 * @param {object} params
 * @param {Array}  params.blackouts   filas de booking_blackouts
 * @param {string} params.serviceType tipo de servicio solicitado
 * @param {Date}   params.startAt     inicio del servicio
 * @param {Date}   params.endAt       fin del servicio
 */
function findBlockingBlackout({ blackouts = [], serviceType, startAt, endAt }) {
  if (!startAt || !endAt) return null;

  return (
    blackouts.find(
      (blackout) =>
        blackout.active !== false &&
        appliesToService(blackout, serviceType) &&
        overlaps(startAt, endAt, toDate(blackout.starts_at), toDate(blackout.ends_at)),
    ) ?? null
  );
}

/**
 * Exige que el intervalo sea reservable. Se llama SIEMPRE en el backend al
 * crear una orden: que el frontend oculte una franja no es una garantia.
 */
function assertBookable({ blackouts, serviceType, startAt, endAt }) {
  const blackout = findBlockingBlackout({ blackouts, serviceType, startAt, endAt });
  if (!blackout) return null;

  throw new DomainError(
    'BOOKING_BLOCKED',
    blackout.reason
      ? `No aceptamos reservas en ese horario: ${blackout.reason}`
      : 'No aceptamos reservas en ese horario',
    {
      blackoutId: blackout.id,
      serviceType: blackout.service_type ?? null,
      startsAt: toDate(blackout.starts_at).toISOString(),
      endsAt: toDate(blackout.ends_at).toISOString(),
      reason: blackout.reason ?? null,
    },
  );
}

/**
 * Franjas horarias disponibles de un dia concreto.
 *
 * Alimenta el asistente de reserva para que no ofrezca horarios que el backend
 * va a rechazar. La decision real sigue tomandose al crear la orden.
 *
 * @param {object} params
 * @param {string} params.date        'AAAA-MM-DD'
 * @param {Array}  params.timeWindows ventanas de la region
 * @param {Array}  params.blackouts
 * @param {string} params.serviceType
 * @param {Function} params.resolveStart (date, 'HH:MM') -> Date, para respetar
 *                                       la misma resolucion horaria del resto
 *                                       del dominio.
 */
function describeDayAvailability({ date, timeWindows, blackouts, serviceType, resolveStart }) {
  const windows = timeWindows.map((window) => {
    const startAt = resolveStart(date, window.startTime);
    const endAt = resolveStart(date, window.endTime);
    const blackout = findBlockingBlackout({ blackouts, serviceType, startAt, endAt });

    return {
      code: window.code,
      label: window.label,
      startTime: window.startTime,
      endTime: window.endTime,
      available: !blackout,
      reason: blackout?.reason ?? null,
    };
  });

  return {
    date,
    windows,
    // Un dia sin ninguna franja libre se marca entero: el calendario lo pinta
    // como cerrado sin tener que mirar franja por franja.
    fullyBlocked: windows.every((window) => !window.available),
  };
}

module.exports = {
  overlaps,
  appliesToService,
  findBlockingBlackout,
  assertBookable,
  describeDayAvailability,
};
