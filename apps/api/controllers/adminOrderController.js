const { getTables, getOpenOrders, createOrder, updateOrderStatus } = require('../models/adminOrderModel');

const VALID_STATUSES = new Set(['paid', 'cancelled']);

const adminOrderController = {
  getTables: async (req, res) => {
    try {
      const tables = await getTables();
      res.json(tables);
    } catch (error) {
      console.error('Error al obtener mesas:', error);
      res.status(500).json({ message: 'Error al obtener mesas' });
    }
  },

  getOpenOrders: async (req, res) => {
    try {
      const orders = await getOpenOrders();
      res.json(orders);
    } catch (error) {
      console.error('Error al obtener órdenes admin:', error);
      res.status(500).json({ message: 'Error al obtener órdenes' });
    }
  },

  createOrder: async (req, res) => {
    const tableId = Number.parseInt(req.body.table_id, 10);
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!Number.isInteger(tableId) || tableId <= 0) {
      return res.status(400).json({ message: 'Selecciona una mesa válida' });
    }

    if (items.length === 0) {
      return res.status(400).json({ message: 'Agrega al menos un plato a la orden' });
    }

    try {
      const order = await createOrder({ tableId, items });
      res.status(201).json(order);
    } catch (error) {
      console.error('Error al crear orden admin:', error);
      res.status(error.statusCode || 500).json({ message: error.message || 'Error al crear orden' });
    }
  },

  updateOrderStatus: async (req, res) => {
    const orderId = Number.parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: 'ID de orden inválido' });
    }

    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }

    try {
      const order = await updateOrderStatus(orderId, status);
      res.json(order);
    } catch (error) {
      console.error('Error al actualizar orden admin:', error);
      res.status(error.statusCode || 500).json({ message: error.message || 'Error al actualizar orden' });
    }
  }
};

module.exports = adminOrderController;
