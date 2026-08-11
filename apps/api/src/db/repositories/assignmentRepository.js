'use strict';

const { db } = require('../index');

/** Asignaciones de trabajadores a ordenes. */

async function findById(id, tx = db) {
  return tx.oneOrNone('SELECT * FROM assignments WHERE id = $1', [id]);
}

async function findActiveForOrder(orderId, role = 'PRIMARY', tx = db) {
  return tx.oneOrNone(
    `SELECT * FROM assignments
      WHERE order_id = $1 AND role = $2 AND status IN ('OFFERED', 'ACCEPTED')`,
    [orderId, role],
  );
}

/**
 * Asignacion viva de un trabajador concreto sobre una orden.
 * Habilita ACCIONES: cambiar estado, ver el codigo de acceso, registrar bolsas.
 */
async function findActiveForStaff(orderId, staffId, tx = db) {
  return tx.oneOrNone(
    `SELECT * FROM assignments
      WHERE order_id = $1 AND staff_id = $2 AND status IN ('OFFERED', 'ACCEPTED')`,
    [orderId, staffId],
  );
}

/**
 * Asignacion del trabajador incluyendo las ya completadas.
 * Habilita LECTURA: el trabajador conserva el historial de sus trabajos
 * terminados, pero al no estar activa ya no puede actuar sobre la orden ni
 * consultar los datos sensibles de acceso.
 */
async function findVisibleForStaff(orderId, staffId, tx = db) {
  return tx.oneOrNone(
    `SELECT * FROM assignments
      WHERE order_id = $1 AND staff_id = $2 AND status IN ('OFFERED', 'ACCEPTED', 'COMPLETED')`,
    [orderId, staffId],
  );
}

async function create({ orderId, staffId, role = 'PRIMARY', assignedBy, notes }, tx = db) {
  return tx.one(
    `INSERT INTO assignments (order_id, staff_id, role, assigned_by, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [orderId, staffId, role, assignedBy ?? null, notes ?? null],
  );
}

async function accept(id, tx = db) {
  return tx.one(
    `UPDATE assignments SET status = 'ACCEPTED', accepted_at = NOW()
      WHERE id = $1 RETURNING *`,
    [id],
  );
}

async function decline(id, reason, tx = db) {
  return tx.one(
    `UPDATE assignments SET status = 'DECLINED', declined_at = NOW(), decline_reason = $2
      WHERE id = $1 RETURNING *`,
    [id, reason ?? null],
  );
}

/** Libera la asignacion para poder reasignar sin violar el indice unico. */
async function release(id, tx = db) {
  return tx.one(
    `UPDATE assignments SET status = 'RELEASED', released_at = NOW()
      WHERE id = $1 RETURNING *`,
    [id],
  );
}

async function complete(orderId, tx = db) {
  return tx.none(
    `UPDATE assignments SET status = 'COMPLETED'
      WHERE order_id = $1 AND status = 'ACCEPTED'`,
    [orderId],
  );
}

/** Historial completo de asignaciones de una orden (incluye reasignaciones). */
async function listForOrder(orderId, tx = db) {
  return tx.any(
    `SELECT a.*, u.first_name, u.last_name,
            ab.first_name AS assigned_by_first_name, ab.last_name AS assigned_by_last_name
       FROM assignments a
       JOIN users u ON u.id = a.staff_id
       LEFT JOIN users ab ON ab.id = a.assigned_by
      WHERE a.order_id = $1
      ORDER BY a.assigned_at DESC`,
    [orderId],
  );
}

module.exports = {
  findById,
  findActiveForOrder,
  findActiveForStaff,
  findVisibleForStaff,
  create,
  accept,
  decline,
  release,
  complete,
  listForOrder,
};
