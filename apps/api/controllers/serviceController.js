const {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getPropertyTypes,
} = require('../models/serviceModel');

const serviceController = {
  getAllServices: async (req, res) => {
    try {
      const { category } = req.query;
      const services = await getAllServices(category || null);
      res.json(services);
    } catch (error) {
      console.error('Error fetching services:', error);
      res.status(500).json({ message: 'Error fetching services' });
    }
  },

  getServiceById: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const service = await getServiceById(id);
      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }

      res.json(service);
    } catch (error) {
      console.error('Error fetching service:', error);
      res.status(500).json({ message: 'Error fetching service' });
    }
  },

  getPropertyTypes: async (req, res) => {
    try {
      const types = await getPropertyTypes();
      res.json(types);
    } catch (error) {
      console.error('Error fetching property types:', error);
      res.status(500).json({ message: 'Error fetching property types' });
    }
  },

  createService: async (req, res) => {
    try {
      const { category, name, description, base_price, price_type, estimated_duration, image_url, display_order } = req.body;

      if (!category || !name) {
        return res.status(400).json({ message: 'Category and name are required' });
      }

      const service = await createService({ category, name, description, base_price, price_type, estimated_duration, image_url, display_order });
      res.status(201).json({ service });
    } catch (error) {
      console.error('Error creating service:', error);
      res.status(500).json({ message: 'Error creating service' });
    }
  },

  updateService: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const existing = await getServiceById(id);
      if (!existing) {
        return res.status(404).json({ message: 'Service not found' });
      }

      const { category, name, description, base_price, price_type, estimated_duration, image_url, is_active, display_order } = req.body;
      const service = await updateService(id, {
        category: category ?? existing.category,
        name: name ?? existing.name,
        description: description ?? existing.description,
        base_price: base_price ?? existing.base_price,
        price_type: price_type ?? existing.price_type,
        estimated_duration: estimated_duration ?? existing.estimated_duration,
        image_url: image_url ?? existing.image_url,
        is_active: is_active ?? existing.is_active,
        display_order: display_order ?? existing.display_order,
      });

      res.json({ service });
    } catch (error) {
      console.error('Error updating service:', error);
      res.status(500).json({ message: 'Error updating service' });
    }
  },

  deleteService: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const deleted = await deleteService(id);
      if (!deleted) {
        return res.status(404).json({ message: 'Service not found' });
      }

      res.json({ message: 'Service deleted' });
    } catch (error) {
      console.error('Error deleting service:', error);
      res.status(500).json({ message: 'Error deleting service' });
    }
  },
};

module.exports = serviceController;
