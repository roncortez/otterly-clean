'use strict';

const { db } = require('../index');

/**
 * Direcciones del cliente.
 *
 * No se borran fisicamente: se archivan, porque hay ordenes historicas que las
 * referencian y perder la direccion romperia la trazabilidad.
 */

/**
 * La coordenada y el texto viajan siempre juntos pero son datos distintos:
 * `latitude`/`longitude`/`google_place_id` dicen donde esta el domicilio;
 * el resto, como lo describe el cliente. Ninguno sustituye al otro.
 */
const FIELDS = `
  id, user_id, label, region_code, street_line1, street_line2, neighborhood,
  city, administrative_area, postal_code, reference, latitude, longitude,
  google_place_id, zone_id, is_default, created_at
`;

async function listByUser(userId, tx = db) {
  return tx.any(
    `SELECT ${FIELDS} FROM addresses
      WHERE user_id = $1 AND archived_at IS NULL
      ORDER BY is_default DESC, created_at DESC`,
    [userId],
  );
}

async function findById(id, tx = db) {
  return tx.oneOrNone(`SELECT ${FIELDS} FROM addresses WHERE id = $1 AND archived_at IS NULL`, [id]);
}

/** Verifica pertenencia antes de usar una direccion en una orden. */
async function findByIdForUser(id, userId, tx = db) {
  return tx.oneOrNone(
    `SELECT ${FIELDS} FROM addresses WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
    [id, userId],
  );
}

async function create(address, tx = db) {
  // Si se marca como predeterminada, se desmarca la anterior primero: el
  // indice unico parcial no permite dos.
  if (address.isDefault) {
    await tx.none(
      'UPDATE addresses SET is_default = FALSE WHERE user_id = $1 AND archived_at IS NULL',
      [address.userId],
    );
  }

  return tx.one(
    `INSERT INTO addresses (
       user_id, label, region_code, street_line1, street_line2, neighborhood,
       city, administrative_area, postal_code, reference, latitude, longitude,
       google_place_id, zone_id, is_default
     ) VALUES (
       $[userId], $[label], $[regionCode], $[streetLine1], $[streetLine2], $[neighborhood],
       $[city], $[administrativeArea], $[postalCode], $[reference], $[latitude], $[longitude],
       $[googlePlaceId], $[zoneId], $[isDefault]
     ) RETURNING ${FIELDS}`,
    address,
  );
}

async function update(id, userId, fields, tx = db) {
  if (fields.is_default) {
    await tx.none(
      'UPDATE addresses SET is_default = FALSE WHERE user_id = $1 AND archived_at IS NULL AND id <> $2',
      [userId, id],
    );
  }

  const allowed = [
    'label',
    'street_line1',
    'street_line2',
    'neighborhood',
    'city',
    'administrative_area',
    'postal_code',
    'reference',
    'latitude',
    'longitude',
    'google_place_id',
    'zone_id',
    'is_default',
  ];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return findByIdForUser(id, userId, tx);

  const sets = entries.map(([key], index) => `${key} = $${index + 3}`);
  return tx.oneOrNone(
    `UPDATE addresses SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
      RETURNING ${FIELDS}`,
    [id, userId, ...entries.map(([, value]) => value)],
  );
}

async function archive(id, userId, tx = db) {
  return tx.oneOrNone(
    `UPDATE addresses SET archived_at = NOW(), is_default = FALSE
      WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
      RETURNING id`,
    [id, userId],
  );
}

module.exports = { listByUser, findById, findByIdForUser, create, update, archive };
