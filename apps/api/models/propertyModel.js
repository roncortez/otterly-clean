const db = require('../db');

const getPropertiesByUser = async (userId) => {
  try {
    return await db.any(
      `SELECT p.*, pt.name AS property_type_name
       FROM properties p
       LEFT JOIN property_types pt ON p.property_type_id = pt.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );
  } catch (error) {
    console.error('Error fetching properties:', error);
    throw error;
  }
};

const getPropertyById = async (id, userId) => {
  try {
    return await db.oneOrNone(
      `SELECT p.*, pt.name AS property_type_name
       FROM properties p
       LEFT JOIN property_types pt ON p.property_type_id = pt.id
       WHERE p.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
  } catch (error) {
    console.error('Error fetching property:', error);
    throw error;
  }
};

const createProperty = async ({ user_id, name, property_type_id, street_address, city, state, zip_code, bedrooms, bathrooms, has_pets, access_instructions }) => {
  try {
    return await db.one(
      `INSERT INTO properties (user_id, name, property_type_id, street_address, city, state, zip_code, bedrooms, bathrooms, has_pets, access_instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        user_id,
        name,
        property_type_id || null,
        street_address || '',
        city || '',
        state || '',
        zip_code || '',
        bedrooms || 0,
        bathrooms || 0,
        has_pets || false,
        access_instructions || '',
      ]
    );
  } catch (error) {
    console.error('Error creating property:', error);
    throw error;
  }
};

const updateProperty = async (id, userId, { name, property_type_id, street_address, city, state, zip_code, bedrooms, bathrooms, has_pets, access_instructions }) => {
  try {
    return await db.oneOrNone(
      `UPDATE properties
       SET name = COALESCE($1, name),
           property_type_id = $2,
           street_address = COALESCE($3, street_address),
           city = COALESCE($4, city),
           state = COALESCE($5, state),
           zip_code = COALESCE($6, zip_code),
           bedrooms = COALESCE($7, bedrooms),
           bathrooms = COALESCE($8, bathrooms),
           has_pets = COALESCE($9, has_pets),
           access_instructions = COALESCE($10, access_instructions)
       WHERE id = $11 AND user_id = $12
       RETURNING *`,
      [name, property_type_id || null, street_address, city, state, zip_code, bedrooms, bathrooms, has_pets, access_instructions, id, userId]
    );
  } catch (error) {
    console.error('Error updating property:', error);
    throw error;
  }
};

const deleteProperty = async (id, userId) => {
  try {
    return await db.result(
      'DELETE FROM properties WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
  } catch (error) {
    console.error('Error deleting property:', error);
    throw error;
  }
};

module.exports = {
  getPropertiesByUser,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
};
