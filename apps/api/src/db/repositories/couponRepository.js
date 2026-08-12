'use strict';

const { db } = require('../index');

async function createCoupon(data, tx = db) {
  return tx.one(
    `INSERT INTO cupones
       (codigo, descripcion, tipo, valor, uso_maximo, uso_por_cliente, monto_minimo, fecha_inicio, fecha_expiracion, activo, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      data.codigo.toUpperCase(),
      data.descripcion || null,
      data.tipo || 'porcentaje',
      data.valor || 0,
      data.usoMaximo || 1,
      data.usoPorCliente || 1,
      data.montoMinimo || 0,
      data.fechaInicio || new Date(),
      data.fechaExpiracion || null,
      data.activo !== false,
      data.creadoPor || null,
    ],
  );
}

async function findByCode(codigo, tx = db) {
  return tx.oneOrNone(
    'SELECT * FROM cupones WHERE LOWER(codigo) = LOWER($1)',
    [codigo],
  );
}

async function listCoupons({ limit = 50, offset = 0 } = {}, tx = db) {
  return tx.any(
    `SELECT * FROM cupones ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
}

async function updateCouponStatus(id, activo, tx = db) {
  return tx.oneOrNone(
    'UPDATE cupones SET activo = $1 WHERE id = $2 RETURNING *',
    [activo, id],
  );
}

async function recordUsage(cuponId, userId, orderId, descuento, tx = db) {
  await tx.none(
    `INSERT INTO cupones_uso (cupon_id, user_id, order_id, descuento_aplicado)
     VALUES ($1, $2, $3, $4)`,
    [cuponId, userId, orderId || null, descuento],
  );

  await tx.none(
    `UPDATE cupones SET usos_realizados = usos_realizados + 1 WHERE id = $1`,
    [cuponId],
  );
}

async function countUserUsages(cuponId, userId, tx = db) {
  const row = await tx.one(
    `SELECT COUNT(*) AS total FROM cupones_uso WHERE cupon_id = $1 AND user_id = $2`,
    [cuponId, userId],
  );
  return Number(row.total);
}

module.exports = {
  createCoupon,
  findByCode,
  listCoupons,
  updateCouponStatus,
  recordUsage,
  countUserUsages,
};
