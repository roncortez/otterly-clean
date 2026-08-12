'use strict';

const { db } = require('../db');
const blackoutRepo = require('../db/repositories/blackoutRepository');
const audit = require('./auditService');
const { getRegion } = require('../config/regions');
const { isServiceType } = require('../domain/shared/serviceTypes');
const {
  assertBookable: assertNotBlacked,
  describeDayAvailability,
} = require('../domain/shared/availability');
const { resolveLocalDateTime, scheduledInterval } = require('../domain/shared/policies');
const { NotFoundError, ValidationError } = require('../domain/errors');

/**
 * Disponibilidad comercial: cuando acepta reservas la plataforma.
 *
 * Se apoya en `domain/shared/availability.js` para decidir y en
 * `blackoutRepository` para leer. Aqui solo se orquesta: leer, decidir,
 * auditar.
 */

const MAX_RANGE_DAYS = 62;

/**
 * Convierte lo que envia la pantalla en un instante concreto.
 *
 * Operaciones piensa en fechas locales ("el 15 de agosto", "de 14:00 a 17:00"),
 * no en instantes UTC. Una fecha suelta se interpreta como el dia completo: el
 * inicio a las 00:00 y el fin al terminar el dia. Sin esto, "bloquear el 15"
 * guardaria de 00:00 a 00:00 y no bloquearia nada.
 */
function resolveBoundary(value, { endOfDay = false } = {}) {
  if (!value) return null;

  // Al editar un bloqueo, el extremo que no se toca vuelve tal cual de la base
  // como Date. Sin este caso, cambiar solo la fecha de inicio fallaba con un
  // "rango invalido" que no tenia nada que ver con lo que se envio.
  if (value instanceof Date) return value;

  const raw = String(value).trim();
  const [datePart, timePart] = raw.includes('T') ? raw.split('T') : [raw, null];

  if (timePart) return resolveLocalDateTime(datePart, timePart.slice(0, 5));
  if (!endOfDay) return resolveLocalDateTime(datePart, '00:00');

  // Fin de dia: 23:59:59.999 del dia indicado, para que el rango sea inclusivo.
  const start = resolveLocalDateTime(datePart, '00:00');
  if (!start) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function parseRange({ startsAt, endsAt, allDay }) {
  const start = resolveBoundary(startsAt);
  const end = resolveBoundary(endsAt ?? startsAt, { endOfDay: allDay || !String(endsAt ?? '').includes('T') });

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError('El rango del bloqueo no es valido', [
      { path: 'startsAt', message: 'Indica una fecha valida' },
    ]);
  }

  if (end <= start) {
    throw new ValidationError('El fin del bloqueo debe ser posterior al inicio', [
      { path: 'endsAt', message: 'El fin debe ser posterior al inicio' },
    ]);
  }

  return { startsAt: start, endsAt: end };
}

// ---------------------------------------------------------------------------
// Validacion al reservar
// ---------------------------------------------------------------------------

/**
 * Rechaza la reserva si cae dentro de un bloqueo vivo.
 *
 * Se comprueba SIEMPRE en el backend. Que el asistente de reserva oculte una
 * franja es comodidad para el cliente, no una barrera: la peticion se puede
 * construir a mano.
 */
async function assertBookableSlot({ serviceType, regionCode, scheduledDate, windowStart, windowEnd }) {
  const interval = scheduledInterval({ scheduledDate, windowStart, windowEnd });
  if (!interval) return null;

  const blackouts = await blackoutRepo.findOverlapping({
    regionCode,
    serviceType,
    startAt: interval.startAt,
    endAt: interval.endAt,
  });

  return assertNotBlacked({
    blackouts,
    serviceType,
    startAt: interval.startAt,
    endAt: interval.endAt,
  });
}

// ---------------------------------------------------------------------------
// Consulta publica
// ---------------------------------------------------------------------------

/**
 * Calendario de disponibilidad para el asistente de reserva: que dias y que
 * franjas se pueden pedir en el rango consultado.
 */
async function getCalendar({ regionCode, serviceType, from, to }) {
  const region = getRegion(regionCode);

  const start = resolveBoundary(from) ?? resolveLocalDateTime(new Date(), '00:00');
  const requestedEnd = resolveBoundary(to, { endOfDay: true });
  const maxEnd = new Date(start.getTime() + MAX_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const end = requestedEnd && requestedEnd < maxEnd ? requestedEnd : maxEnd;

  const blackouts = await blackoutRepo.list({
    regionCode: region.code,
    serviceType,
    from: start,
    to: end,
  });

  const days = [];
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
      cursor.getDate(),
    ).padStart(2, '0')}`;

    days.push(
      describeDayAvailability({
        date,
        timeWindows: region.booking.timeWindows,
        blackouts,
        serviceType,
        resolveStart: resolveLocalDateTime,
      }),
    );
  }

  return {
    regionCode: region.code,
    serviceType: serviceType ?? null,
    from: days[0]?.date ?? null,
    to: days.at(-1)?.date ?? null,
    days,
    // Solo lo necesario para explicar al cliente por que un dia esta cerrado.
    blackouts: blackouts.map(projectPublicBlackout),
  };
}

/** El motivo se muestra al cliente; quien lo creo y cuando, no. */
function projectPublicBlackout(blackout) {
  return {
    serviceType: blackout.service_type,
    startsAt: blackout.starts_at,
    endsAt: blackout.ends_at,
    reason: blackout.reason,
  };
}

// ---------------------------------------------------------------------------
// Administracion
// ---------------------------------------------------------------------------

async function list({ regionCode, includeInactive = true, from, to, serviceType }) {
  return blackoutRepo.list({ regionCode, includeInactive, from, to, serviceType });
}

function assertKnownServiceType(serviceType) {
  if (serviceType && !isServiceType(serviceType)) {
    throw new ValidationError('Tipo de servicio desconocido', [
      { path: 'serviceType', message: 'Tipo de servicio desconocido' },
    ]);
  }
}

/**
 * Crea un bloqueo.
 *
 * Los pedidos que ya existian NO se tocan: bloquear la agenda cierra la puerta
 * a reservas nuevas, no cancela compromisos ya adquiridos con clientes. Si hay
 * que cancelar algo, es una decision caso por caso de Operaciones.
 */
async function create({ payload, actor, request }) {
  assertKnownServiceType(payload.serviceType);
  const { startsAt, endsAt } = parseRange(payload);

  return db.tx(async (tx) => {
    const blackout = await blackoutRepo.create(
      {
        serviceType: payload.serviceType ?? null,
        regionCode: payload.regionCode ?? actor.region_code,
        startsAt,
        endsAt,
        reason: payload.reason,
        createdBy: actor.id,
      },
      tx,
    );

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.BOOKING_BLACKOUT_CREATED,
        entityType: 'booking_blackout',
        entityId: blackout.id,
        after: {
          serviceType: blackout.service_type,
          startsAt: blackout.starts_at,
          endsAt: blackout.ends_at,
          reason: blackout.reason,
        },
        request,
      },
      tx,
    );

    return blackout;
  });
}

async function update({ blackoutId, payload, actor, request }) {
  const before = await blackoutRepo.findById(blackoutId);
  if (!before) throw new NotFoundError('Bloqueo de agenda', blackoutId);

  assertKnownServiceType(payload.serviceType);

  const fields = {};
  if (payload.serviceType !== undefined) fields.service_type = payload.serviceType ?? null;
  if (payload.reason !== undefined) fields.reason = payload.reason;
  if (payload.active !== undefined) fields.active = payload.active;

  if (payload.startsAt !== undefined || payload.endsAt !== undefined) {
    const { startsAt, endsAt } = parseRange({
      startsAt: payload.startsAt ?? before.starts_at,
      endsAt: payload.endsAt ?? before.ends_at,
      allDay: payload.allDay,
    });
    fields.starts_at = startsAt;
    fields.ends_at = endsAt;
  }

  return db.tx(async (tx) => {
    const after = await blackoutRepo.update(blackoutId, fields, tx);

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.BOOKING_BLACKOUT_UPDATED,
        entityType: 'booking_blackout',
        entityId: blackoutId,
        before: { startsAt: before.starts_at, endsAt: before.ends_at, active: before.active },
        after: { startsAt: after.starts_at, endsAt: after.ends_at, active: after.active },
        request,
      },
      tx,
    );

    return after;
  });
}

async function remove({ blackoutId, actor, request }) {
  const before = await blackoutRepo.findById(blackoutId);
  if (!before) throw new NotFoundError('Bloqueo de agenda', blackoutId);

  return db.tx(async (tx) => {
    await blackoutRepo.remove(blackoutId, tx);

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.BOOKING_BLACKOUT_DELETED,
        entityType: 'booking_blackout',
        entityId: blackoutId,
        before: {
          serviceType: before.service_type,
          startsAt: before.starts_at,
          endsAt: before.ends_at,
          reason: before.reason,
        },
        request,
      },
      tx,
    );

    return { deleted: true };
  });
}

module.exports = {
  assertBookableSlot,
  getCalendar,
  list,
  create,
  update,
  remove,
  resolveBoundary,
};
