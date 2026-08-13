'use strict';

const { db } = require('../db');
const orderRepo = require('../db/repositories/orderRepository');
const assignmentRepo = require('../db/repositories/assignmentRepository');
const audit = require('./auditService');
const notifications = require('../notifications');
const orderService = require('./orderService');
const { ROLES } = require('../domain/shared/roles');
const { NotFoundError, ForbiddenError } = require('../domain/errors');

/**
 * Incidencias.
 *
 * Reportar una incidencia hace dos cosas a la vez: crea el registro y mueve la
 * orden al estado excepcional correspondiente, para que el cliente vea que algo
 * pasa sin tener que leer notas internas.
 *
 * Dos responsabilidades que no se mezclan:
 *
 *   * **Reportar el hecho** lo hace quien lo vive —el trabajador que confirmo
 *     el servicio o el cliente— y consiste en describir que paso.
 *   * **Clasificar su gravedad** lo hace Operaciones (`classify`). La gravedad
 *     decide a quien se avisa y que se compensa: es una decision de negocio, no
 *     una impresion de quien reporta, y por eso nace vacia en lugar de con un
 *     "MEDIA" por defecto que nadie eligio.
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
    // Una incidencia mueve la orden a una rama excepcional, avisa a Operaciones
    // y queda en el expediente del servicio. Quien todavia no ha confirmado que
    // hara el trabajo no tiene nada que reportar sobre el: primero se acepta,
    // y si no se puede atender, se rechaza la asignacion.
    if (assignment.status !== 'ACCEPTED') {
      throw new ForbiddenError('Confirma el trabajo antes de reportar una incidencia');
    }
  } else if (actor.role === ROLES.CUSTOMER && order.customer_id !== actor.id) {
    throw new NotFoundError('Orden', orderId);
  }

  const incident = await db.tx(async (tx) => {
    // `severity` no se escribe aqui a proposito: nace sin clasificar y la pone
    // Operaciones desde `classify`.
    const created = await tx.one(
      `INSERT INTO incidents
         (order_id, reported_by, reporter_role, category, description, attachments)
       VALUES ($1, $2, $3, $4, $5, $6:json)
       RETURNING *`,
      [orderId, actor.id, actor.role, payload.category, payload.description, payload.attachments ?? []],
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

/**
 * Clasificacion administrativa: Operaciones decide la gravedad.
 *
 * Se puede reclasificar —lo que parecia menor deja de serlo cuando aparece el
 * parte del seguro— y cada cambio queda auditado con su valor anterior.
 */
async function classify({ incidentId, actor, payload, request }) {
  const incident = await db.oneOrNone('SELECT * FROM incidents WHERE id = $1', [incidentId]);
  if (!incident) throw new NotFoundError('Incidencia', incidentId);

  return db.tx(async (tx) => {
    const updated = await tx.one(
      `UPDATE incidents
          SET severity = $2, classified_by = $3, classified_at = NOW()
        WHERE id = $1 RETURNING *`,
      [incidentId, payload.severity, actor.id],
    );

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.INCIDENT_CLASSIFIED,
        entityType: 'incident',
        entityId: incidentId,
        before: { severity: incident.severity },
        after: { severity: updated.severity },
        metadata: { orderId: incident.order_id, note: payload.note ?? null },
        request,
      },
      tx,
    );

    return updated;
  });
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

/**
 * Cola de Operaciones. Las que esperan clasificacion van primero: nadie sabe
 * todavia si son graves, y esa es exactamente la razon para mirarlas.
 */
async function listOpen({ status, limit = 50 } = {}) {
  return db.any(
    `SELECT i.*, o.reference, o.service_type, o.scheduled_date,
            u.first_name, u.last_name
       FROM incidents i
       JOIN orders o ON o.id = i.order_id
       LEFT JOIN users u ON u.id = i.reported_by
      WHERE i.status = ANY($1)
      ORDER BY
        CASE
          WHEN i.severity IS NULL THEN 0
          WHEN i.severity = 'HIGH' THEN 1
          WHEN i.severity = 'MEDIUM' THEN 2
          ELSE 3
        END,
        i.created_at DESC
      LIMIT $2`,
    [status ? [status] : ['OPEN', 'IN_REVIEW'], limit],
  );
}

module.exports = { report, classify, resolve, listForOrder, listOpen };
