const {
  getPropertiesByUser,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
} = require('../models/propertyModel');

const propertyController = {
  getProperties: async (req, res) => {
    try {
      const userId = parseInt(req.query.user_id, 10);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ message: 'user_id is required' });
      }
      const properties = await getPropertiesByUser(userId);
      res.json(properties);
    } catch (error) {
      console.error('Error fetching properties:', error);
      res.status(500).json({ message: 'Error fetching properties' });
    }
  },

  getProperty: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const userId = parseInt(req.query.user_id, 10);
      if (Number.isNaN(id) || Number.isNaN(userId)) {
        return res.status(400).json({ message: 'Invalid ID' });
      }
      const property = await getPropertyById(id, userId);
      if (!property) {
        return res.status(404).json({ message: 'Property not found' });
      }
      res.json(property);
    } catch (error) {
      console.error('Error fetching property:', error);
      res.status(500).json({ message: 'Error fetching property' });
    }
  },

  createProperty: async (req, res) => {
    try {
      const { user_id, name, property_type_id, street_address, city, state, zip_code, bedrooms, bathrooms, has_pets, access_instructions } = req.body;
      if (!user_id || !name || !street_address) {
        return res.status(400).json({ message: 'user_id, name, and street address are required' });
      }
      const property = await createProperty({
        user_id,
        name,
        property_type_id,
        street_address,
        city,
        state,
        zip_code,
        bedrooms,
        bathrooms,
        has_pets,
        access_instructions,
      });
      res.status(201).json(property);
    } catch (error) {
      console.error('Error creating property:', error);
      res.status(500).json({ message: 'Error creating property' });
    }
  },

  updateProperty: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { user_id, name, property_type_id, street_address, city, state, zip_code, bedrooms, bathrooms, has_pets, access_instructions } = req.body;
      if (Number.isNaN(id) || !user_id) {
        return res.status(400).json({ message: 'Invalid ID or user_id' });
      }
      const updated = await updateProperty(id, user_id, {
        name,
        property_type_id,
        street_address,
        city,
        state,
        zip_code,
        bedrooms,
        bathrooms,
        has_pets,
        access_instructions,
      });
      if (!updated) {
        return res.status(404).json({ message: 'Property not found' });
      }
      res.json(updated);
    } catch (error) {
      console.error('Error updating property:', error);
      res.status(500).json({ message: 'Error updating property' });
    }
  },

  deleteProperty: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const userId = parseInt(req.query.user_id, 10);
      if (Number.isNaN(id) || Number.isNaN(userId)) {
        return res.status(400).json({ message: 'Invalid ID' });
      }
      const result = await deleteProperty(id, userId);
      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Property not found' });
      }
      res.json({ message: 'Property deleted' });
    } catch (error) {
      console.error('Error deleting property:', error);
      res.status(500).json({ message: 'Error deleting property' });
    }
  },
};

module.exports = propertyController;
