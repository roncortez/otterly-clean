const {
  createOrder,
  addOrderItem,
  getOrderById,
  getOrderItems,
  getOrderPhotos,
  getCustomerOrders,
  getAllOrders,
  updateOrderStatus,
  updateOrderPayment,
  addOrderPhoto,
  setQuotedPrice,
  getDashboardStats,
  STATUSES,
} = require('../models/orderModel');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const normalizePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const orderController = {
  createOrder: async (req, res) => {
    try {
      const {
        customer_id,
        service_type,
        property_type_id,
        number_of_bedrooms,
        number_of_bathrooms,
        has_pets,
        pickup_date,
        pickup_time_start,
        pickup_time_end,
        delivery_date,
        delivery_time_start,
        delivery_time_end,
        service_address,
        pickup_address,
        city,
        state,
        zip_code,
        access_instructions,
        repair_description,
        special_instructions,
        base_price,
        extra_charges,
        discount,
        total,
        payment_method,
        items,
      } = req.body;

      if (!service_type || !['cleaning', 'laundry', 'repair'].includes(service_type)) {
        return res.status(400).json({ message: 'Valid service_type is required (cleaning, laundry, repair)' });
      }

      if (service_type === 'cleaning' && !service_address) {
        return res.status(400).json({ message: 'service_address is required for cleaning orders' });
      }

      if ((service_type === 'laundry' || service_type === 'repair') && !pickup_address) {
        return res.status(400).json({ message: 'pickup_address is required for laundry/repair orders' });
      }

      const order = await createOrder({
        customer_id,
        service_type,
        property_type_id,
        number_of_bedrooms,
        number_of_bathrooms,
        has_pets,
        pickup_date,
        pickup_time_start,
        pickup_time_end,
        delivery_date,
        delivery_time_start,
        delivery_time_end,
        service_address,
        pickup_address,
        city,
        state,
        zip_code,
        access_instructions,
        repair_description,
        special_instructions,
        base_price,
        extra_charges,
        discount,
        total,
        payment_method,
      });

      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          await addOrderItem({
            order_id: order.id,
            service_id: item.service_id,
            garment_type: item.garment_type,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            notes: item.notes,
            photo_url: item.photo_url,
          });
        }
      }

      const fullOrder = await getOrderById(order.id);
      const orderItems = await getOrderItems(order.id);

      res.status(201).json({ order: fullOrder, items: orderItems });
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ message: 'Error creating order' });
    }
  },

  getOrderById: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const order = await getOrderById(id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      const items = await getOrderItems(id);
      const photos = await getOrderPhotos(id);

      res.json({ order, items, photos });
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ message: 'Error fetching order' });
    }
  },

  getMyOrders: async (req, res) => {
    try {
      const customerId = parseInt(req.params.customerId, 10);
      if (Number.isNaN(customerId)) {
        return res.status(400).json({ message: 'Invalid customer ID' });
      }

      const page = normalizePositiveInt(req.query.page, DEFAULT_PAGE);
      const limit = Math.min(normalizePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);

      const result = await getCustomerOrders(customerId, { page, limit });
      res.json(result);
    } catch (error) {
      console.error('Error fetching customer orders:', error);
      res.status(500).json({ message: 'Error fetching orders' });
    }
  },

  getAllOrders: async (req, res) => {
    try {
      const { from, to, service_type, status } = req.query;
      const page = normalizePositiveInt(req.query.page, DEFAULT_PAGE);
      const limit = Math.min(normalizePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);

      const result = await getAllOrders({ from, to, service_type, status, page, limit });
      res.json(result);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ message: 'Error fetching orders' });
    }
  },

  updateStatus: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ message: 'Status is required' });
      }

      const order = await getOrderById(id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      const validStatuses = STATUSES[order.service_type];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          message: `Invalid status '${status}' for ${order.service_type} order`,
          valid_statuses: validStatuses,
        });
      }

      const updated = await updateOrderStatus(id, status);
      res.json({ order: updated });
    } catch (error) {
      console.error('Error updating status:', error);
      res.status(500).json({ message: 'Error updating status' });
    }
  },

  setQuotedPrice: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const { quoted_price, inspection_notes } = req.body;
      if (quoted_price === undefined || quoted_price === null) {
        return res.status(400).json({ message: 'quoted_price is required' });
      }

      const order = await getOrderById(id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      if (order.service_type !== 'repair') {
        return res.status(400).json({ message: 'Quoted price is only available for repair orders' });
      }

      const updated = await setQuotedPrice(id, quoted_price, inspection_notes);
      res.json({ order: updated });
    } catch (error) {
      console.error('Error setting quoted price:', error);
      res.status(500).json({ message: 'Error setting quoted price' });
    }
  },

  addPhoto: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const { photo_url, photo_type, order_item_id } = req.body;
      if (!photo_url || !photo_type) {
        return res.status(400).json({ message: 'photo_url and photo_type are required' });
      }

      const photo = await addOrderPhoto({
        order_id: id,
        order_item_id: order_item_id || null,
        photo_url,
        photo_type,
      });

      res.status(201).json({ photo });
    } catch (error) {
      console.error('Error adding photo:', error);
      res.status(500).json({ message: 'Error adding photo' });
    }
  },

  getDashboard: async (req, res) => {
    try {
      const { date } = req.params;
      const stats = await getDashboardStats(date || null);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      res.status(500).json({ message: 'Error fetching dashboard' });
    }
  },
};

module.exports = orderController;
