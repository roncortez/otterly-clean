'use strict';

const { DomainError } = require('../errors');

/**
 * Politicas de negocio que dependen del tiempo y de la region.
 * Son funciones puras: reciben el estado y devuelven un veredicto.
 */

const MS_PER_HOUR = 3_600_000;

/**
 * Momento en que el servicio debe comenzar.
 * Combina la fecha agendada con el inicio de la ventana horaria.
 *
 * La fecha llega como cadena 'AAAA-MM-DD' (JSON) o como Date (columna DATE de
 * PostgreSQL). No se puede usar `new Date('2026-08-13')` y luego setHours:
 * esa cadena se interpreta como medianoche UTC y setHours trabaja en hora
 * local, asi que en zonas con offset negativo -como Ecuador (UTC-5)- el
 * resultado caia en el dia anterior. Se extraen los componentes de forma
 * explicita para que la fecha sea siempre la que el cliente eligio.
 *
 * Nota: se usa la hora local del servidor. Al operar en varias zonas horarias
 * a la vez habra que resolver el instante con la timezone de la region
 * (region.timezone). Ver docs/ARCHITECTURE.md
 */
function scheduledStartAt(order) {
  if (!order.scheduled_date) return null;

  let year;
  let month;
  let day;

  if (order.scheduled_date instanceof Date) {
    year = order.scheduled_date.getFullYear();
    month = order.scheduled_date.getMonth();
    day = order.scheduled_date.getDate();
  } else {
    const parts = String(order.scheduled_date).slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    [year, month, day] = [parts[0], parts[1] - 1, parts[2]];
  }

  const time = String(order.scheduled_window_start ?? '00:00');
  const [hours, minutes] = time.split(':').map(Number);

  return new Date(year, month, day, hours || 0, minutes || 0, 0, 0);
}

/**
 * Evalua si una orden puede cancelarse y con que consecuencia economica.
 *
 * El estandar del sector es cancelacion libre con N horas de antelacion
 * (48h en EE.UU., mas flexible en Quito). Pasado ese umbral la cancelacion
 * sigue siendo posible pero se marca como tardia, para que Operaciones pueda
 * aplicar un cargo cuando exista cobro real.
 */
function evaluateCancellation({ order, region, now = new Date() }) {
  const startAt = scheduledStartAt(order);
  const freeHours = region.booking.freeCancellationHours;

  if (!startAt) {
    return { allowed: true, late: false, hoursUntilStart: null, freeCancellationHours: freeHours };
  }

  const hoursUntilStart = (startAt.getTime() - now.getTime()) / MS_PER_HOUR;
  return {
    allowed: true,
    late: hoursUntilStart < freeHours,
    hoursUntilStart: Math.round(hoursUntilStart * 10) / 10,
    freeCancellationHours: freeHours,
  };
}

/**
 * Verifica que la fecha/hora solicitada respete la antelacion minima.
 * Se valida en el backend porque el frontend no es una fuente confiable.
 */
function assertValidSchedule({ scheduledDate, windowStart, region, now = new Date() }) {
  const startAt = scheduledStartAt({
    scheduled_date: scheduledDate,
    scheduled_window_start: windowStart,
  });

  if (!startAt || Number.isNaN(startAt.getTime())) {
    throw new DomainError('INVALID_SCHEDULE', 'La fecha del servicio no es valida', {
      field: 'scheduledDate',
    });
  }

  const minLead = region.booking.minLeadTimeHours;
  const hoursUntilStart = (startAt.getTime() - now.getTime()) / MS_PER_HOUR;

  if (hoursUntilStart < minLead) {
    throw new DomainError(
      'SCHEDULE_TOO_SOON',
      `El servicio debe agendarse con al menos ${minLead} horas de antelacion`,
      { minLeadTimeHours: minLead, hoursUntilStart: Math.round(hoursUntilStart * 10) / 10 },
    );
  }

  return startAt;
}

/** Valida que la ventana horaria exista en la configuracion de la region. */
function resolveTimeWindow({ windowCode, region }) {
  const window = region.booking.timeWindows.find((w) => w.code === windowCode);
  if (!window) {
    throw new DomainError('INVALID_TIME_WINDOW', 'Ventana horaria no disponible', {
      windowCode,
      allowed: region.booking.timeWindows.map((w) => w.code),
    });
  }
  return window;
}

module.exports = {
  scheduledStartAt,
  evaluateCancellation,
  assertValidSchedule,
  resolveTimeWindow,
};
