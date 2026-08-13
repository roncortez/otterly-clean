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
 * `latitude`/`longitude` dicen donde esta el domicilio; el resto, como lo
 * describe el cliente. Ninguno sustituye al otro.
 *
 * `provider_place_id` y `geocoding_provider` son solo la referencia de quien
 * geocodifico el punto. No se llaman como el proveedor de turno a proposito
 * (ver migracion 010) y la direccion tiene que servir aunque vengan vacios.
 */
const FIELDS = `
  id, user_id, label, region_code, street_line1, street_line2, neighborhood,
  city, administrative_area, postal_code, reference, latitude, longitude,
  provider_place_id, geocoding_provider, zone_id, is_default, created_at
`;

/**
 * Direcciones con el lugar de limpieza que viva en cada una.
 *
 * El LATERAL trae el lugar en la misma consulta porque juntos se usan: al
 * reservar limpieza el asistente necesita saber que sabemos ya de ese sitio
 * para no volver a preguntarlo. `access_code` viaja cifrado y el servicio solo
 * expone si existe, nunca su valor (ver docs/SECURITY.md).
 */
async function listByUser(userId, tx = db) {
  return tx.any(
    `SELECT a.id, a.user_id, a.label, a.region_code, a.street_line1, a.street_line2,
            a.neighborhood, a.city, a.administrative_area, a.postal_code, a.reference,
            a.latitude, a.longitude, a.provider_place_id, a.geocoding_provider,
            a.zone_id, a.is_default, a.created_at,
            p.id AS property_id, p.name AS property_name, p.property_type AS property_type,
            p.bedrooms AS property_bedrooms, p.bathrooms AS property_bathrooms,
            p.access_code AS property_access_code, p.notes AS property_notes,
            p.access_method AS property_access_method,
            p.access_instructions AS property_access_instructions,
            p.parking_instructions AS property_parking_instructions,
            p.customer_present AS property_customer_present, p.has_pets AS property_has_pets,
            p.pets AS property_pets, p.pets_secured AS property_pets_secured,
            p.pet_instructions AS property_pet_instructions,
            p.delicate_items AS property_delicate_items,
            p.is_default AS property_is_default
     FROM addresses a
     LEFT JOIN LATERAL (
       SELECT id, name, property_type, bedrooms, bathrooms, access_code, notes, access_method,
              access_instructions, parking_instructions, customer_present, has_pets, pets,
              pets_secured, pet_instructions, delicate_items, is_default
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

/** Cuantas direcciones vivas tiene el cliente. Decide quien es predeterminada. */
async function countActive(userId, tx = db) {
  const row = await tx.one(
    'SELECT COUNT(*)::int AS total FROM addresses WHERE user_id = $1 AND archived_at IS NULL',
    [userId],
  );
  return row.total;
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
       provider_place_id, geocoding_provider, zone_id, is_default
     ) VALUES (
       $[userId], $[label], $[regionCode], $[streetLine1], $[streetLine2], $[neighborhood],
       $[city], $[administrativeArea], $[postalCode], $[reference], $[latitude], $[longitude],
       $[providerPlaceId], $[geocodingProvider], $[zoneId], $[isDefault]
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
    'provider_place_id',
    'geocoding_provider',
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

/**
 * Asciende una direccion a predeterminada cuando el cliente se quedo sin
 * ninguna (archivo la que lo era). Se elige la mas reciente por ser la que
 * probablemente sigue usando. No hace nada si ya hay una.
 */
async function ensureDefault(userId, tx = db) {
  return tx.oneOrNone(
    `UPDATE addresses SET is_default = TRUE, updated_at = NOW()
      WHERE id = (
        SELECT id FROM addresses
         WHERE user_id = $1 AND archived_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM addresses d
              WHERE d.user_id = $1 AND d.archived_at IS NULL AND d.is_default
           )
         ORDER BY created_at DESC
         LIMIT 1
      )
      RETURNING ${FIELDS}`,
    [userId],
  );
}

module.exports = {
  listByUser,
  findById,
  findByIdForUser,
  countActive,
  create,
  update,
  archive,
  ensureDefault,
};
