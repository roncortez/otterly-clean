const bcrypt = require('bcryptjs');
const db = require('../db');

const TABLE_ORDER_EMAIL = process.env.TABLE_ORDER_EMAIL || 'table-orders@otterly-clean.local';

const ensureAdminOrderTables = async () => {
  await db.none(`CREATE TABLE IF NOT EXISTS admin_tables (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'available',
    active_order_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  const count = await db.one('SELECT COUNT(*)::int AS total FROM admin_tables');
  if (count.total === 0) {
    const values = Array.from({ length: 10 }, (_, index) => `Mesa ${index + 1}`);
    await db.none('INSERT INTO admin_tables (name) SELECT * FROM UNNEST($1::text[])', [values]);
  }
};

const ensureTableCustomer = async (tx) => {
  const existingUser = await tx.oneOrNone('SELECT id FROM users WHERE email = $1', [TABLE_ORDER_EMAIL]);
  if (existingUser) return existingUser.id;

  const hashedPassword = await bcrypt.hash(`mesa-${Date.now()}`, 10);
  const user = await tx.one(
    `INSERT INTO users (email, first_name, last_name, password, role, telefono)
     VALUES ($1, 'Orden', 'Mesa', $2, 'user', '-')
     RETURNING id`,
    [TABLE_ORDER_EMAIL, hashedPassword]
  );

  return user.id;
};

const getTables = async () => {
  await ensureAdminOrderTables();
  return db.any(`SELECT t.*, p.total AS active_order_total, p.fecha_hora AS active_order_created_at
    FROM admin_tables t
    LEFT JOIN pedido p ON p.id = t.active_order_id
    ORDER BY t.id ASC`);
};

const getOpenOrders = async () => {
  await ensureAdminOrderTables();
  return db.any(`SELECT p.*, t.name AS table_name
    FROM admin_tables t
    INNER JOIN pedido p ON p.id = t.active_order_id
    WHERE t.status = 'occupied'
    ORDER BY p.fecha_hora DESC`);
};

const createOrder = async ({ tableId, items }) => {
  await ensureAdminOrderTables();

  return db.tx(async (tx) => {
    const table = await tx.oneOrNone('SELECT * FROM admin_tables WHERE id = $1 FOR UPDATE', [tableId]);
    if (!table) {
      const error = new Error('Mesa no encontrada');
      error.statusCode = 404;
      throw error;
    }

    if (table.active_order_id) {
      const error = new Error('La mesa ya tiene una orden activa');
      error.statusCode = 409;
      throw error;
    }

    const menuIds = items.map((item) => Number(item.menu_id));
    const menuRows = await tx.any('SELECT id, precio FROM menu WHERE id IN ($1:csv)', [menuIds]);
    const priceById = new Map(menuRows.map((row) => [Number(row.id), Number(row.precio)]));

    if (priceById.size !== new Set(menuIds).size) {
      const error = new Error('Uno o mas platos no existen');
      error.statusCode = 400;
      throw error;
    }

    const normalizedItems = items.map((item) => {
      const menuId = Number(item.menu_id);
      const quantity = Number.parseInt(item.quantity, 10);
      const unitPrice = priceById.get(menuId);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        const error = new Error('Las cantidades deben ser mayores a cero');
        error.statusCode = 400;
        throw error;
      }

      return {
        menuId,
        quantity,
        unitPrice,
        total: Number((unitPrice * quantity).toFixed(2)),
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : []
      };
    });

    const customerId = await ensureTableCustomer(tx);
    const orderTotal = normalizedItems.reduce((sum, item) => sum + item.total, 0);
    const order = await tx.one(
      `INSERT INTO pedido (id_cliente, total, fecha_hora, delivery, lugar_envio)
       VALUES ($1, $2, CURRENT_TIMESTAMP, false, $3)
       RETURNING *`,
      [customerId, orderTotal, table.name]
    );

    await tx.batch(normalizedItems.map((item) => tx.none(
      `INSERT INTO detalle_pedidos (pedido_id, menu_id, cantidad, precio, ingredientes)
       VALUES ($1, $2, $3, $4, $5)`,
      [order.id, item.menuId, item.quantity, item.total, JSON.stringify(item.ingredients)]
    )));

    await tx.none(
      `UPDATE admin_tables
       SET status = 'occupied', active_order_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [order.id, tableId]
    );

    return order;
  });
};

const updateOrderStatus = async (orderId, status) => {
  await ensureAdminOrderTables();

  if (status !== 'paid' && status !== 'cancelled') {
    const error = new Error('Estado invalido');
    error.statusCode = 400;
    throw error;
  }

  return db.tx(async (tx) => {
    const table = await tx.oneOrNone('SELECT * FROM admin_tables WHERE active_order_id = $1 FOR UPDATE', [orderId]);
    if (!table) {
      const error = new Error('No hay una mesa ocupada para esta orden');
      error.statusCode = 404;
      throw error;
    }

    await tx.none(
      `UPDATE admin_tables
       SET status = 'available', active_order_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [table.id]
    );

    return tx.one('SELECT * FROM pedido WHERE id = $1', [orderId]);
  });
};

module.exports = {
  getTables,
  getOpenOrders,
  createOrder,
  updateOrderStatus
};
