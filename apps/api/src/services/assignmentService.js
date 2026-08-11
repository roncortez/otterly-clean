'use strict';

const { db } = require('../db');
const orderRepo = require('../db/repositories/orderRepository');
const assignmentRepo = require('../db/repositories/assignmentRepository');
const staffRepo = require('../db/repositories/staffRepository');
const audit = require('./auditService');
const notifications = require('../notifications');
const orderService = require('./orderService');
const { getStateMachine } = require('../domain/shared/serviceTypes');
const { ROLES } = require('../domain/shared/roles');
const { NotFoundError, ForbiddenError, ConflictError, DomainError } = require('../domain/errors');

/**
 * Asignacion de trabajadores.
 *
 * Regla central del modelo de negocio: la empresa asigna, el trabajador no
 * elige. Todo lo que hay aqui solo puede dispararlo un ADMIN, salvo aceptar o
 * rechazar la asignacion recibida.
 */

/** Estados desde los que tiene sentido asignar, por tipo de servicio. */
const ASSIGNABLE_STATUSES = {
  CLEANING: ['REQUESTED', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'CONFIRMED'],
  LAUNDRY: ['REQUESTED', 'PICKUP_SCHEDULED', 'ASSIGNED', 'PICKUP_CONFIRMED'],
};

/** Estado al que pasa la orden una vez asignada. */
const ASSIGNED_STATUS = { CLEANING: 'ASSIGNED', LAUNDRY: 'ASSIGNED' };

/** Candidatos sugeridos, ordenados por menor carga del dia. */
async function listCandidates(orderId) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw new NotFoundError('Orden', orderId);

  return staffRepo.findCandidates({
    serviceType: order.service_type,
    zoneId: order.zone_id,
    date: order.scheduled_date,
  });
}

/**
 * Asigna (o reasigna) un trabajador a una orden.
 *
 * Si ya habia una asignacion viva se libera primero, dejando ambas en el
 * historial: se puede reconstruir quien estuvo asignado y quien lo cambio.
 */
async function assignStaff({ orderId, staffId, role = 'PRIMARY', actor, notes, request }) {
  if (actor.role !== ROLES.ADMIN) {
    throw new ForbiddenError('Solo Operaciones puede asignar trabajadores');
  }

  const order = await orderRepo.findById(orderId);
  if (!order) throw new NotFoundError('Orden', orderId);

  const allowed = ASSIGNABLE_STATUSES[order.service_type] ?? [];
  if (!allowed.includes(order.status)) {
    throw new ConflictError(
      `No se puede asignar un trabajador con la orden en estado ${order.status}`,
      { status: order.status, allowed },
    );
  }

  const staff = await staffRepo.findAdminProfile(staffId);
  if (!staff) throw new NotFoundError('Trabajador', staffId);

  if (!staff.active || staff.status !== 'ACTIVE') {
    throw new ConflictError('Ese trabajador no esta activo');
  }
  if (staff.verification_status !== 'VERIFIED') {
    throw new ConflictError('El trabajador no ha completado la verificacion');
  }
  if (!staff.service_types.includes(order.service_type)) {
    throw new ConflictError('El trabajador no atiende este tipo de servicio', {
      serviceType: order.service_type,
      staffServiceTypes: staff.service_types,
    });
  }

  return db.tx(async (tx) => {
    const existing = await assignmentRepo.findActiveForOrder(orderId, role, tx);
    const isReassignment = Boolean(existing);

    if (existing) {
      if (existing.staff_id === staffId) {
        throw new ConflictError('Ese trabajador ya esta asignado a esta orden');
      }
      await assignmentRepo.release(existing.id, tx);
    }

    const assignment = await assignmentRepo.create(
      { orderId, staffId, role, assignedBy: actor.id, notes },
      tx,
    );

    // Al reasignar, la orden vuelve al estado ASSIGNED para que el nuevo
    // trabajador tenga que confirmar de nuevo.
    const targetStatus = ASSIGNED_STATUS[order.service_type];
    if (order.status !== targetStatus) {
      const stateMachine = getStateMachine(order.service_type);
      // Puede requerir pasar por la cola intermedia (REQUESTED -> PENDING...).
      const path = resolvePath(stateMachine, order.status, targetStatus, ROLES.ADMIN);
      let current = order.status;
      for (const next of path) {
        await orderRepo.updateStatus(orderId, { status: next, milestones: {} }, tx);
        await orderRepo.insertStatusHistory(
          {
            orderId,
            fromStatus: current,
            toStatus: next,
            actorId: actor.id,
            actorRole: actor.role,
            note: next === targetStatus ? 'Trabajador asignado' : null,
          },
          tx,
        );
        current = next;
      }
    } else if (isReassignment) {
      await orderRepo.insertStatusHistory(
        {
          orderId,
          fromStatus: order.status,
          toStatus: order.status,
          actorId: actor.id,
          actorRole: actor.role,
          note: 'Trabajador reasignado',
        },
        tx,
      );
    }

    await audit.record(
      {
        actor,
        action: isReassignment ? audit.ACTIONS.STAFF_REASSIGNED : audit.ACTIONS.STAFF_ASSIGNED,
        entityType: 'order',
        entityId: orderId,
        before: existing ? { staffId: existing.staff_id } : null,
        after: { staffId, role },
        metadata: { reference: order.reference },
        request,
      },
      tx,
    );

    await notifications.emit(
      'ORDER_ASSIGNED',
      {
        orderId,
        reference: order.reference,
        customerId: order.customer_id,
        staffId,
        staffName: staff.display_name ?? staff.first_name,
      },
      tx,
    );

    return assignment;
  });
}

/**
 * Camino mas corto entre dos estados usando solo transiciones permitidas al
 * rol. Evita saltos ilegales cuando la orden aun esta en REQUESTED y hay que
 * pasar por la cola de asignacion.
 */
function resolvePath(stateMachine, from, to, role) {
  if (from === to) return [];

  const queue = [[from, []]];
  const visited = new Set([from]);

  while (queue.length > 0) {
    const [current, path] = queue.shift();
    for (const option of stateMachine.allowedTransitions(current, role)) {
      if (visited.has(option.to)) continue;
      const nextPath = [...path, option.to];
      if (option.to === to) return nextPath;
      visited.add(option.to);
      queue.push([option.to, nextPath]);
    }
  }

  throw new DomainError('NO_TRANSITION_PATH', `No hay camino de ${from} a ${to}`, { from, to });
}

/** El trabajador acepta la asignacion que se le entrego. */
async function acceptAssignment({ orderId, actor, request }) {
  const assignment = await assignmentRepo.findActiveForStaff(orderId, actor.id);
  if (!assignment) throw new NotFoundError('Asignacion', orderId);
  if (assignment.status === 'ACCEPTED') {
    throw new ConflictError('Ya confirmaste esta asignacion');
  }

  const order = await orderRepo.findById(orderId);
  await db.tx(async (tx) => {
    await assignmentRepo.accept(assignment.id, tx);
    await audit.record(
      {
        actor,
        action: audit.ACTIONS.ASSIGNMENT_ACCEPTED,
        entityType: 'assignment',
        entityId: assignment.id,
        metadata: { orderId, reference: order.reference },
        request,
      },
      tx,
    );
  });

  // Confirmar la asignacion mueve la orden a CONFIRMED / PICKUP_CONFIRMED.
  const confirmStatus = order.service_type === 'LAUNDRY' ? 'PICKUP_CONFIRMED' : 'CONFIRMED';
  return orderService.transitionStatus({
    orderId,
    toStatus: confirmStatus,
    actor,
    note: 'Asignacion confirmada por el trabajador',
    request,
  });
}

/** El trabajador rechaza: la orden vuelve a la cola de Operaciones. */
async function declineAssignment({ orderId, actor, reason, request }) {
  const assignment = await assignmentRepo.findActiveForStaff(orderId, actor.id);
  if (!assignment) throw new NotFoundError('Asignacion', orderId);

  const order = await orderRepo.findById(orderId);
  const queueStatus = order.service_type === 'LAUNDRY' ? 'PICKUP_SCHEDULED' : 'PENDING_ASSIGNMENT';

  return db.tx(async (tx) => {
    await assignmentRepo.decline(assignment.id, reason, tx);

    await orderRepo.updateStatus(orderId, { status: queueStatus, milestones: {} }, tx);
    await orderRepo.insertStatusHistory(
      {
        orderId,
        fromStatus: order.status,
        toStatus: queueStatus,
        actorId: actor.id,
        actorRole: actor.role,
        note: `Asignacion rechazada: ${reason ?? 'sin motivo'}`,
      },
      tx,
    );

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.ASSIGNMENT_DECLINED,
        entityType: 'assignment',
        entityId: assignment.id,
        metadata: { orderId, reference: order.reference, reason },
        request,
      },
      tx,
    );

    return { declined: true, orderStatus: queueStatus };
  });
}

async function listForOrder(orderId) {
  return assignmentRepo.listForOrder(orderId);
}

module.exports = {
  listCandidates,
  assignStaff,
  acceptAssignment,
  declineAssignment,
  listForOrder,
};
