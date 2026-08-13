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
    `SELECT a.id, a.user_id, a.label, a.region_code, a.street_line1, a.street_line2,
            a.neighborhood, a.city, a.administrative_area, a.postal_code, a.reference,
            a.latitude, a.longitude, a.google_place_id, a.zone_id, a.is_default, a.created_at,
            p.id AS property_id, p.name AS property_name, p.property_type AS property_type,
            p.bedrooms AS property_bedrooms, p.bathrooms AS property_bathrooms,
            p.access_code AS property_access_code, p.notes AS property_notes,
            p.access_method AS property_access_method,
            p.access_instructions AS property_access_instructions,
            p.parking_instructions AS property_parking_instructions,
            p.customer_present AS property_customer_present, p.has_pets AS property_has_pets,
            p.pets AS property_pets, p.pets_secured AS property_pets_secured,
            p.pet_instructions AS property_pet_instructions,
            p.delicate_items AS property_delicate_items
     FROM addresses a
     LEFT JOIN LATERAL (
       SELECT id, name, property_type, bedrooms, bathrooms, access_code, notes, access_method,
              access_instructions, parking_instructions, customer_present, has_pets, pets,
              pets_secured, pet_instructions, delicate_items
       FROM properties
       WHERE address_id = a.id
       ORDER BY created_at DESC
       LIMIT 1
     ) p ON TRUE
     WHERE a.user_id = $1 AND a.archived_at IS NULL
     ORDER BY a.is_default DESC, a.created_at DESC`,
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
