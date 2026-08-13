'use strict';

const { db } = require('../index');

/**
 * Inmuebles del cliente.
 *
 * Un inmueble es el perfil de la residencia que vive en una direccion. La
 * direccion (calle, coordenadas, cobertura) es la fuente de verdad y vive en
 * `addresses`; aqui se guarda solo `address_id` y lo que describe al espacio
 * (tipo, habitaciones, codigo de acceso cifrado, notas).
 */

const ACCESS_COLUMNS = [
  'name',
  'property_type',
  'bedrooms',
  'bathrooms',
  'access_code',
  'notes',
  'access_method',
  'access_instructions',
  'parking_instructions',
  'customer_present',
  'has_pets',
  'pets',
  'pets_secured',
  'pet_instructions',
  'delicate_items',
];

async function createProperty(userId, data, tx = db) {
  return tx.one(
    `INSERT INTO properties
       (user_id, address_id, name, property_type, bedrooms, bathrooms, access_code, notes,
        access_method, access_instructions, parking_instructions, customer_present,
        has_pets, pets, pets_secured, pet_instructions, delicate_items)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14:json, $15, $16, $17)
     RETURNING *`,
    [
      userId,
      data.addressId,
      data.name,
      data.propertyType,
      data.bedrooms,
      data.bathrooms,
      data.accessCode || null,
      data.notes || null,
      data.accessMethod || null,
      data.accessInstructions || null,
      data.parkingInstructions || null,
      data.customerPresent ?? true,
      data.hasPets ?? false,
      data.pets ?? [],
      data.petsSecured ?? null,
      data.petInstructions || null,
      data.delicateItems || null,
    ],
  );
}

/**
 * Actualizacion parcial del inmueble propio: solo se aplican los campos que
 * vienen en `fields` (claves en snake_case) y `pets` se serializa a JSONB.
 */
async function updateProperty(id, userId, fields, tx = db) {
  const entries = Object.entries(fields).filter(([key]) => ACCESS_COLUMNS.includes(key));
  if (entries.length === 0) return findPropertyById(id, userId, tx);

  const sets = entries.map(([key], index) => `${key} = $${index + 3}`);
  const values = entries.map(([key, value]) => (key === 'pets' ? JSON.stringify(value) : value));
  return tx.oneOrNone(
    `UPDATE properties SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [id, userId, ...values],
  );
}

/** Lista los inmuebles del usuario con su direccion unida. */
async function listUserProperties(userId, tx = db) {
  return tx.any(
    `SELECT p.id, p.user_id, p.address_id, p.name, p.property_type, p.bedrooms, p.bathrooms,
            p.access_code, p.notes, p.access_method, p.access_instructions,
            p.parking_instructions, p.customer_present, p.has_pets, p.pets, p.pets_secured,
            p.pet_instructions, p.delicate_items, p.created_at, p.updated_at,
            a.id AS addr_id, a.label AS addr_label, a.street_line1 AS addr_street_line1,
            a.street_line2 AS addr_street_line2, a.neighborhood AS addr_neighborhood,
            a.city AS addr_city, a.administrative_area AS addr_administrative_area,
            a.reference AS addr_reference, a.latitude AS addr_latitude,
            a.longitude AS addr_longitude, a.zone_id AS addr_zone_id, a.is_default AS addr_is_default
     FROM properties p
     JOIN addresses a ON a.id = p.address_id AND a.archived_at IS NULL
     WHERE p.user_id = $1
     ORDER BY a.is_default DESC, p.created_at DESC`,
    [userId],
  );
}

async function findPropertyById(id, userId, tx = db) {
  return tx.oneOrNone(
    `SELECT * FROM properties WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
}

async function findByAddress(addressId, userId, tx = db) {
  return tx.oneOrNone(
    'SELECT * FROM properties WHERE address_id = $1 AND user_id = $2',
    [addressId, userId],
  );
}

async function deleteProperty(id, userId, tx = db) {
  return tx.oneOrNone('DELETE FROM properties WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
}

module.exports = {
  createProperty,
  updateProperty,
  listUserProperties,
  findPropertyById,
  findByAddress,
  deleteProperty,
};
