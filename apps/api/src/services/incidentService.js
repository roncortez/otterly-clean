'use strict';

const { db } = require('../db');
const orderRepo = require('../db/repositories/orderRepository');
const assignmentRepo = require('../db/repositories/assignmentRepository');
const audit = require('./auditService');
const notifications = require('../notifications');
const orderService = require('./orderService');
const { ROLES } = require('../domain/shared/roles');
const { NotFoundError } = require('../domain/errors');

/**
 * Incidencias.
 *
 * Reportar una incidencia hace dos cosas a la vez: crea el registro y mueve la
 * orden al estado excepcional correspondiente, para que el cliente vea que algo
 * pasa sin tener que leer notas internas.
 */

/** Categoria de incidencia -> estado al que va la orden. */
function targetStatus(serviceType, category) {
  if (serviceType === 'CLEANING') {
    return category === 'NO_ACCESS' ? 'NO_ACCESS' : 'INCIDENT_REPORTED';
  }
  return 'ISSUE_REPORTED';
}

async function report({ orderId, actor, payload, request }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw new NotFoundError('Orden', orderId);

  if (actor.role === ROLES.STAFF) {
    const assignment = await assignmentRepo.findActiveForStaff(orderId, actor.id);
    if (!assignment) throw new NotFoundError('Orden', orderId);
  } else if (actor.role === ROLES.CUSTOMER && order.customer_id !== actor.id) {
    throw new NotFoundError('Orden', orderId);
  }

  const incident = await db.tx(async (tx) => {
    const created = await tx.one(
      `INSERT INTO incidents
         (order_id, reported_by, reporter_role, category, severity, description, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7:json)
       RETURNING *`,
      [
        orderId,
        actor.id,
        actor.role,
        payload.category,
        payload.severity ?? 'MEDIUM',
        payload.description,
        payload.attachments ?? [],
      ],
    );

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.INCIDENT_REPORTED,
        entityType: 'order',
        entityId: orderId,
        after: { incidentId: created.id, category: payload.category },
        metadata: { reference: order.reference },
        request,
      },
      tx,
    );

    return created;
  });

  // Mover la orden al estado excepcional. Si la transicion no es legal desde
  // el estado actual, la incidencia queda igualmente registrada.
  const nextStatus = targetStatus(order.service_type, payload.category);
  let statusChanged = false;
  try {
    await orderService.transitionStatus({
      orderId,
      toStatus: nextStatus,
      actor,
      note: `Incidencia: ${payload.description}`,
      request,
    });
    statusChanged = true;
  } catch {
    // El estado actual no admite la rama excepcional; no es un fallo del
    // reporte, solo significa que la orden ya estaba fuera del flujo normal.
  }

  await notifications.emit('INCIDENT_REPORTED', {
    orderId,
    reference: order.reference,
    customerId: order.customer_id,
  });

  return { incident, statusChanged };
}

async function resolve({ incidentId, actor, payload, request }) {
  const incident = await db.oneOrNone('SELECT * FROM incidents WHERE id = $1', [incidentId]);
  if (!incident) throw new NotFoundError('Incidencia', incidentId);

  return db.tx(async (tx) => {
    const updated = await tx.one(
      `UPDATE incidents
          SET status = $2, resolution = $3, resolved_by = $4, resolved_at = NOW()
        WHERE id = $1 RETURNING *`,
      [incidentId, payload.status ?? 'RESOLVED', payload.resolution ?? null, actor.id],
    );

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.INCIDENT_RESOLVED,
        entityType: 'incident',
        entityId: incidentId,
        before: { status: incident.status },
        after: { status: updated.status },
        request,
      },
      tx,
    );

    return updated;
  });
}

async function listForOrder(orderId) {
  return db.any(
    `SELECT i.*, u.first_name, u.last_name
       FROM incidents i
       LEFT JOIN users u ON u.id = i.reported_by
      WHERE i.order_id = $1
      ORDER BY i.created_at DESC`,
    [orderId],
  );
}

async function listOpen({ status, limit = 50 } = {}) {
  return db.any(
    `SELECT i.*, o.reference, o.service_type, o.scheduled_date,
            u.first_name, u.last_name
       FROM incidents i
       JOIN orders o ON o.id = i.order_id
       LEFT JOIN users u ON u.id = i.reported_by
      WHERE i.status = ANY($1)
      ORDER BY
        CASE i.severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
        i.created_at DESC
      LIMIT $2`,
    [status ? [status] : ['OPEN', 'IN_REVIEW'], limit],
  );
}

module.exports = { report, resolve, listForOrder, listOpen };
