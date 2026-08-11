'use strict';

const { db } = require('../db');
const orderRepo = require('../db/repositories/orderRepository');
const assignmentRepo = require('../db/repositories/assignmentRepository');
const audit = require('./auditService');
const { ROLES } = require('../domain/shared/roles');
const { NotFoundError, ConflictError } = require('../domain/errors');

/**
 * Bolsas de lavanderia.
 *
 * Es la pieza que evita el problema operativo mas caro de este negocio:
 * confundir la ropa de dos clientes. Cada bolsa recibe un codigo derivado de
 * la referencia de la orden (OC-2026-000123-B0001), de modo que el codigo por
 * si solo dice a que pedido pertenece.
 *
 * Hoy el codigo se imprime o escribe a mano. La estructura ya permite adjuntar
 * un QR o codigo de barras despues sin cambiar nada.
 */

async function listForOrder(orderId) {
  return db.any('SELECT * FROM laundry_bags WHERE order_id = $1 ORDER BY created_at', [orderId]);
}

/** Registra las bolsas al recoger o al recibir en planta. */
async function registerBags({ orderId, actor, bags, request }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw new NotFoundError('Orden', orderId);
  if (order.service_type !== 'LAUNDRY') {
    throw new ConflictError('Solo las ordenes de lavanderia tienen bolsas');
  }

  if (actor.role === ROLES.STAFF) {
    const assignment = await assignmentRepo.findActiveForStaff(orderId, actor.id);
    if (!assignment) throw new NotFoundError('Orden', orderId);
  }

  return db.tx(async (tx) => {
    const created = [];

    for (const bag of bags) {
      const bagCode = await orderRepo.nextBagCode(order.reference, tx);
      const row = await tx.one(
        `INSERT INTO laundry_bags
           (order_id, bag_code, label, weight, weight_unit, contents_summary, item_count, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          orderId,
          bagCode,
          bag.label ?? null,
          bag.weight ?? null,
          bag.weightUnit ?? null,
          bag.contentsSummary ?? null,
          bag.itemCount ?? null,
          bag.notes ?? null,
        ],
      );
      created.push(row);
    }

    // El peso real de la orden es la suma de sus bolsas pesadas.
    await tx.none(
      `UPDATE laundry_details
          SET actual_weight = (
                SELECT SUM(weight) FROM laundry_bags WHERE order_id = $1 AND weight IS NOT NULL
              )
        WHERE order_id = $1`,
      [orderId],
    );

    await audit.record(
      {
        actor,
        action: 'LAUNDRY_BAGS_REGISTERED',
        entityType: 'order',
        entityId: orderId,
        after: { bagCodes: created.map((b) => b.bag_code) },
        metadata: { reference: order.reference },
        request,
      },
      tx,
    );

    return created;
  });
}

async function updateBagStatus({ bagId, actor, payload, request }) {
  const bag = await db.oneOrNone('SELECT * FROM laundry_bags WHERE id = $1', [bagId]);
  if (!bag) throw new NotFoundError('Bolsa', bagId);

  if (actor.role === ROLES.STAFF) {
    const assignment = await assignmentRepo.findActiveForStaff(bag.order_id, actor.id);
    if (!assignment) throw new NotFoundError('Bolsa', bagId);
  }

  const timestampColumn = {
    PICKED_UP: 'picked_up_at',
    RECEIVED: 'received_at',
    DELIVERED: 'delivered_at',
  }[payload.status];

  return db.tx(async (tx) => {
    const updated = await tx.one(
      `UPDATE laundry_bags
          SET status = $2,
              weight = COALESCE($3, weight)
              ${timestampColumn ? `, ${timestampColumn} = NOW()` : ''}
        WHERE id = $1 RETURNING *`,
      [bagId, payload.status, payload.weight ?? null],
    );

    await audit.record(
      {
        actor,
        action: 'LAUNDRY_BAG_STATUS_CHANGED',
        entityType: 'laundry_bag',
        entityId: bagId,
        before: { status: bag.status },
        after: { status: payload.status },
        metadata: { bagCode: bag.bag_code, orderId: bag.order_id },
        request,
      },
      tx,
    );

    return updated;
  });
}

module.exports = { listForOrder, registerBags, updateBagStatus };
