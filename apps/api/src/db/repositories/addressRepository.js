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
 * (ver migracion 005) y la direccion tiene que servir aunque vengan vacios.
 */
const FIELDS = `
  id, user_id, label, region_code, street_line1, street_line2, neighborhood,
  city, administrative_area, postal_code, reference, latitude, longitude,
  provider_place_id, geocoding_provider, zone_id, is_default, created_at
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

// ---------------------------------------------------------------------------
// Datos del hogar para limpieza
//
// Cuelgan de la direccion, no de una entidad "inmueble" aparte: la direccion ya
// es lo unico que comparten todos los servicios, y estos datos -cuantas
// habitaciones, como se entra, si hay mascotas- solo los usa limpieza. Misma
// relacion que cleaning_details con orders, un nivel mas arriba.
// ---------------------------------------------------------------------------

// Se califican con el alias porque la consulta del listado une con `addresses`,
// que tiene columnas del mismo nombre (`updated_at`).
const CLEANING_PROFILE_FIELDS = `
  p.address_id, p.property_type, p.bedrooms, p.bathrooms, p.area_value, p.area_unit,
  p.has_pets, p.pets, p.pet_instructions, p.access_method, p.access_instructions,
  p.access_secret_encrypted, p.parking_instructions, p.notes, p.updated_at
`;

async function findCleaningProfile(addressId, tx = db) {
  return tx.oneOrNone(
    `SELECT ${CLEANING_PROFILE_FIELDS} FROM address_cleaning_profiles p WHERE p.address_id = $1`,
    [addressId],
  );
}

async function listCleaningProfilesByUser(userId, tx = db) {
  return tx.any(
    `SELECT ${CLEANING_PROFILE_FIELDS}
       FROM address_cleaning_profiles p
       JOIN addresses a ON a.id = p.address_id
      WHERE a.user_id = $1 AND a.archived_at IS NULL`,
    [userId],
  );
}

/**
 * Guarda los datos del hogar. Solo escribe los campos presentes: la reserva
 * aporta los que pregunta y la pantalla de "Mi hogar" los que muestra, y
 * ninguna debe borrar lo que la otra guardo.
 */
async function upsertCleaningProfile(addressId, fields, tx = db) {
  const allowed = [
    'property_type',
    'bedrooms',
    'bathrooms',
    'area_value',
    'area_unit',
    'has_pets',
    'pets',
    'pet_instructions',
    'access_method',
    'access_instructions',
    'access_secret_encrypted',
    'parking_instructions',
    'notes',
  ];

  const entries = Object.entries(fields).filter(
    ([key, value]) => allowed.includes(key) && value !== undefined,
  );
  if (entries.length === 0) return findCleaningProfile(addressId, tx);

  const columns = entries.map(([key]) => key);
  const placeholders = entries.map((entry, index) =>
    entry[0] === 'pets' ? `$${index + 2}:json` : `$${index + 2}`,
  );
  const updates = columns.map((column, index) =>
    column === 'pets' ? `${column} = $${index + 2}:json` : `${column} = $${index + 2}`,
  );

  return tx.one(
    `INSERT INTO address_cleaning_profiles AS p (address_id, ${columns.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (address_id) DO UPDATE
        SET ${updates.join(', ')}, updated_at = NOW()
     RETURNING ${CLEANING_PROFILE_FIELDS}`,
    [addressId, ...entries.map(([, value]) => value)],
  );
}

module.exports = {
  listByUser,
  findById,
  findByIdForUser,
  create,
  update,
  archive,
  findCleaningProfile,
  listCleaningProfilesByUser,
  upsertCleaningProfile,
};
