const db = require('../db');

const STATUSES = {
  cleaning: ['pending', 'confirmed', 'scheduled', 'in_progress', 'completed', 'cancelled'],
  laundry: ['pending', 'picked_up', 'processing', 'ready', 'delivered', 'cancelled'],
  repair: ['pending', 'picked_up', 'inspected', 'quoted', 'accepted', 'repairing', 'ready', 'delivered', 'cancelled'],
};

const createOrder = async (orderData) => {
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
  } = orderData;

  try {
    return await db.one(
      `INSERT INTO orders (
        customer_id, service_type, status,
        property_type_id, number_of_bedrooms, number_of_bathrooms, has_pets,
        pickup_date, pickup_time_start, pickup_time_end,
        delivery_date, delivery_time_start, delivery_time_end,
        service_address, pickup_address, city, state, zip_code, access_instructions,
        repair_description, special_instructions,
        base_price, extra_charges, discount, total, payment_method
      ) VALUES (
        $1, $2, 'pending',
        $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15, $16, $17, $18,
        $19, $20,
        $21, $22, $23, $24, $25
      ) RETURNING *`,
      [
        customer_id, service_type,
        property_type_id || null, number_of_bedrooms || null, number_of_bathrooms || null, has_pets || false,
        pickup_date || null, pickup_time_start || null, pickup_time_end || null,
        delivery_date || null, delivery_time_start || null, delivery_time_end || null,
        service_address, pickup_address || null, city || null, state || null, zip_code || null, access_instructions || null,
        repair_description || null, special_instructions || null,
        base_price || 0, extra_charges || 0, discount || 0, total || 0, payment_method || null,
      ]
    );
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
};

const addOrderItem = async ({ order_id, service_id, garment_type, quantity, unit_price, total_price, notes, photo_url }) => {
  try {
    return await db.one(
      `INSERT INTO order_items (order_id, service_id, garment_type, quantity, unit_price, total_price, notes, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [order_id, service_id, garment_type || null, quantity || 1, unit_price || 0, total_price || 0, notes || null, photo_url || null]
    );
  } catch (error) {
    console.error('Error adding order item:', error);
    throw error;
  }
};

const getOrderById = async (id) => {
  try {
    return await db.oneOrNone(
      `SELECT o.*,
              u.first_name, u.last_name, u.email, u.telefono,
              pt.name AS property_type_name
       FROM orders o
       LEFT JOIN users u ON o.customer_id = u.id
       LEFT JOIN property_types pt ON o.property_type_id = pt.id
       WHERE o.id = $1`,
      [id]
    );
  } catch (error) {
    console.error('Error fetching order:', error);
    throw error;
  }
};

const getOrderItems = async (orderId) => {
  try {
    return await db.any(
      `SELECT oi.*, s.name AS service_name
       FROM order_items oi
       LEFT JOIN services s ON oi.service_id = s.id
       WHERE oi.order_id = $1`,
      [orderId]
    );
  } catch (error) {
    console.error('Error fetching order items:', error);
    throw error;
  }
};

const getOrderPhotos = async (orderId) => {
  try {
    return await db.any(
      'SELECT * FROM order_photos WHERE order_id = $1 ORDER BY uploaded_at',
      [orderId]
    );
  } catch (error) {
    console.error('Error fetching order photos:', error);
    throw error;
  }
};

const getCustomerOrders = async (customerId, { page = 1, limit = 20 } = {}) => {
  try {
    const offset = (page - 1) * limit;
    const [orders, countResult] = await db.task(t => t.batch([
      t.any(
        `SELECT o.*, pt.name AS property_type_name
         FROM orders o
         LEFT JOIN property_types pt ON o.property_type_id = pt.id
         WHERE o.customer_id = $1
         ORDER BY o.created_at DESC
         LIMIT $2 OFFSET $3`,
        [customerId, limit, offset]
      ),
      t.one('SELECT COUNT(*)::int AS total FROM orders WHERE customer_id = $1', [customerId]),
    ]));

    return {
      data: orders,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit),
      },
    };
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    throw error;
  }
};

const getAllOrders = async ({ from, to, service_type, status, page = 1, limit = 20 } = {}) => {
  try {
    const offset = (page - 1) * limit;
    const conditions = [];
    const values = [];

    if (from) {
      values.push(from);
      conditions.push(`o.created_at >= $${values.length}::date`);
    }
    if (to) {
      values.push(to);
      conditions.push(`o.created_at < ($${values.length}::date + INTERVAL '1 day')`);
    }
    if (service_type) {
      values.push(service_type);
      conditions.push(`o.service_type = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`o.status = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    values.push(limit, offset);
    const limitPlaceholder = `$${values.length - 1}`;
    const offsetPlaceholder = `$${values.length}`;

    const query = `
      SELECT o.*,
             u.first_name, u.last_name, u.email, u.telefono,
             pt.name AS property_type_name
      FROM orders o
      LEFT JOIN users u ON o.customer_id = u.id
      LEFT JOIN property_types pt ON o.property_type_id = pt.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const countQuery = `SELECT COUNT(*)::int AS total FROM orders o ${whereClause}`;
    const countValues = values.slice(0, values.length - 2);

    const [orders, countResult] = await db.task(t => t.batch([
      t.any(query, values),
      t.one(countQuery, countValues),
    ]));

    return {
      data: orders,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit),
      },
    };
  } catch (error) {
    console.error('Error fetching all orders:', error);
    throw error;
  }
};

const updateOrderStatus = async (id, newStatus) => {
  try {
    const order = await db.oneOrNone('SELECT service_type FROM orders WHERE id = $1', [id]);
    if (!order) throw new Error('Order not found');

    const validStatuses = STATUSES[order.service_type];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status '${newStatus}' for ${order.service_type} order`);
    }

    const updates = { status: newStatus, updated_at: new Date() };
    if (newStatus === 'completed' || newStatus === 'delivered') {
      updates.completed_at = new Date();
    }

    return await db.one(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       ${newStatus === 'completed' || newStatus === 'delivered' ? ', completed_at = NOW()' : ''}
       WHERE id = $2 RETURNING *`,
      [newStatus, id]
    );
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
};

const updateOrderPayment = async (id, { payment_status, stripe_payment_intent_id, payment_method }) => {
  try {
    return await db.one(
      `UPDATE orders
       SET payment_status = $1,
           stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
           payment_method = COALESCE($3, payment_method),
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [payment_status, stripe_payment_intent_id || null, payment_method || null, id]
    );
  } catch (error) {
    console.error('Error updating order payment:', error);
    throw error;
  }
};

const addOrderPhoto = async ({ order_id, order_item_id, photo_url, photo_type }) => {
  try {
    return await db.one(
      `INSERT INTO order_photos (order_id, order_item_id, photo_url, photo_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [order_id, order_item_id || null, photo_url, photo_type]
    );
  } catch (error) {
    console.error('Error adding order photo:', error);
    throw error;
  }
};

const setQuotedPrice = async (orderId, quotedPrice, inspectionNotes) => {
  try {
    return await db.one(
      `UPDATE orders
       SET quoted_price = $1, inspection_notes = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [quotedPrice, inspectionNotes || null, orderId]
    );
  } catch (error) {
    console.error('Error setting quoted price:', error);
    throw error;
  }
};

const getDashboardStats = async (date) => {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const [orderCount, revenue, byType, byStatus] = await db.task(t => t.batch([
      t.one(
        `SELECT COUNT(*)::int AS total
         FROM orders WHERE created_at::date = $1`,
        [targetDate]
      ),
      t.one(
        `SELECT COALESCE(SUM(total), 0)::decimal AS total
         FROM orders WHERE created_at::date = $1 AND payment_status = 'paid'`,
        [targetDate]
      ),
      t.any(
        `SELECT service_type, COUNT(*)::int AS count
         FROM orders WHERE created_at::date = $1
         GROUP BY service_type`,
        [targetDate]
      ),
      t.any(
        `SELECT status, COUNT(*)::int AS count
         FROM orders WHERE created_at::date = $1
         GROUP BY status`,
        [targetDate]
      ),
    ]));

    return {
      date: targetDate,
      total_orders: orderCount.total,
      total_revenue: Number(revenue.total),
      by_type: byType,
      by_status: byStatus,
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
};

module.exports = {
  STATUSES,
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
};
