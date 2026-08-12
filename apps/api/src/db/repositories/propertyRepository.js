'use strict';

const { db } = require('../index');

async function createProperty(userId, data, tx = db) {
  return tx.one(
    `INSERT INTO properties
       (user_id, name, property_type, bedrooms, bathrooms, street_address, dependent_locality, locality, administrative_area, postal_code, access_code, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      userId,
      data.name,
      data.propertyType || 'Residential',
      data.bedrooms || 1,
      data.bathrooms || 1,
      data.streetAddress,
      data.dependentLocality || null,
      data.locality || 'Quito',
      data.administrativeArea || 'Pichincha',
      data.postalCode || null,
      data.accessCode || null,
      data.notes || null,
    ],
  );
}

async function listUserProperties(userId, tx = db) {
  return tx.any('SELECT * FROM properties WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
}

async function findPropertyById(id, userId, tx = db) {
  return tx.oneOrNone('SELECT * FROM properties WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function deleteProperty(id, userId, tx = db) {
  return tx.oneOrNone('DELETE FROM properties WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
}

module.exports = {
  createProperty,
  listUserProperties,
  findPropertyById,
  deleteProperty,
};
