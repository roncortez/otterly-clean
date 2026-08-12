'use strict';

const { db } = require('../index');

/**
 * Bloqueos comerciales de agenda.
 *
 * Nada de logica de solapamiento aqui: eso es dominio
 * (`domain/shared/availability.js`). Este modulo solo trae las filas que
 * pueden afectar al intervalo consultado.
 */

async function list({ regionCode, includeInactive = false, from, to, serviceType }, tx = db) {
  const conditions = ['region_code = $1'];
  const values = [regionCode];

  if (!includeInactive) conditions.push('active');

  if (from) {
    values.push(from);
    conditions.push(`ends_at >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    conditions.push(`starts_at <= $${values.length}`);
  }
  if (serviceType) {
    values.push(serviceType);
    // Un bloqueo global (service_type NULL) afecta tambien a este servicio.
    conditions.push(`(service_type IS NULL OR service_type = $${values.length})`);
  }

  return tx.any(
    `SELECT * FROM booking_blackouts WHERE ${conditions.join(' AND ')} ORDER BY starts_at`,
    values,
  );
}

/**
 * Bloqueos vivos que pueden afectar a un intervalo concreto.
 * Se filtra en SQL para no traer el historico entero a memoria.
 */
async function findOverlapping({ regionCode, serviceType, startAt, endAt }, tx = db) {
  return tx.any(
    `SELECT * FROM booking_blackouts
      WHERE region_code = $1
        AND active
        AND (service_type IS NULL OR service_type = $2)
        AND starts_at < $4
        AND ends_at > $3
      ORDER BY starts_at`,
    [regionCode, serviceType, startAt, endAt],
  );
}

async function findById(id, tx = db) {
  return tx.oneOrNone('SELECT * FROM booking_blackouts WHERE id = $1', [id]);
}

async function create(
  { serviceType, regionCode, startsAt, endsAt, reason, createdBy },
  tx = db,
) {
  return tx.one(
    `INSERT INTO booking_blackouts (service_type, region_code, starts_at, ends_at, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [serviceType ?? null, regionCode, startsAt, endsAt, reason ?? null, createdBy ?? null],
  );
}

async function update(id, fields, tx = db) {
  const allowed = ['service_type', 'starts_at', 'ends_at', 'reason', 'active'];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return findById(id, tx);

  const sets = entries.map(([key], index) => `${key} = $${index + 2}`);
  return tx.oneOrNone(
    `UPDATE booking_blackouts SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1 RETURNING *`,
    [id, ...entries.map(([, value]) => value)],
  );
}

async function remove(id, tx = db) {
  return tx.oneOrNone('DELETE FROM booking_blackouts WHERE id = $1 RETURNING *', [id]);
}

module.exports = { list, findOverlapping, findById, create, update, remove };
