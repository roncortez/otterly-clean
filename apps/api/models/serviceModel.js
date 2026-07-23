const db = require('../db');

const getAllServices = async (category = null) => {
  try {
    if (category) {
      return await db.any(
        'SELECT * FROM services WHERE category = $1 AND is_active = true ORDER BY display_order',
        [category]
      );
    }
    return await db.any(
      'SELECT * FROM services WHERE is_active = true ORDER BY display_order'
    );
  } catch (error) {
    console.error('Error fetching services:', error);
    throw error;
  }
};

const getServiceById = async (id) => {
  try {
    return await db.oneOrNone('SELECT * FROM services WHERE id = $1', [id]);
  } catch (error) {
    console.error('Error fetching service:', error);
    throw error;
  }
};

const createService = async ({ category, name, description, base_price, price_type, estimated_duration, image_url, display_order }) => {
  try {
    return await db.one(
      `INSERT INTO services (category, name, description, base_price, price_type, estimated_duration, image_url, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [category, name, description, base_price, price_type, estimated_duration, image_url || null, display_order || 0]
    );
  } catch (error) {
    console.error('Error creating service:', error);
    throw error;
  }
};

const updateService = async (id, { category, name, description, base_price, price_type, estimated_duration, image_url, is_active, display_order }) => {
  try {
    return await db.one(
      `UPDATE services
       SET category = $1, name = $2, description = $3, base_price = $4,
           price_type = $5, estimated_duration = $6, image_url = $7,
           is_active = $8, display_order = $9
       WHERE id = $10 RETURNING *`,
      [category, name, description, base_price, price_type, estimated_duration, image_url, is_active, display_order, id]
    );
  } catch (error) {
    console.error('Error updating service:', error);
    throw error;
  }
};

const deleteService = async (id) => {
  try {
    const result = await db.result('DELETE FROM services WHERE id = $1', [id]);
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting service:', error);
    throw error;
  }
};

const getPropertyTypes = async () => {
  try {
    return await db.any('SELECT * FROM property_types ORDER BY base_multiplier');
  } catch (error) {
    console.error('Error fetching property types:', error);
    throw error;
  }
};

module.exports = {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getPropertyTypes,
};
