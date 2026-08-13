'use strict';

const { db } = require('../db');
const orderRepo = require('../db/repositories/orderRepository');
const addressRepo = require('../db/repositories/addressRepository');
const addressService = require('./addressService');
const catalogRepo = require('../db/repositories/catalogRepository');
const assignmentRepo = require('../db/repositories/assignmentRepository');
const audit = require('./auditService');
const serviceCatalog = require('./serviceCatalogService');
const availability = require('./availabilityService');
const notifications = require('../notifications');
const { encrypt, decrypt } = require('./crypto');
const { getRegion } = require('../config/regions');
const { getStateMachine } = require('../domain/shared/serviceTypes');
const { calculatePrice } = require('../domain/pricing/pricing');
const { buildTimeline } = require('../domain/shared/timeline');
const {
  assertValidSchedule,
  resolveTimeWindow,
  evaluateCancellation,
} = require('../domain/shared/policies');
const { ROLES } = require('../domain/shared/roles');
const { NotFoundError, ForbiddenError } = require('../domain/errors');

/**
 * Orquestacion de ordenes.
 *
 * Es la unica capa que combina dominio + persistencia + auditoria +
 * notificaciones. Los controladores no hablan con la base de datos y el
 * dominio no sabe que existe una base de datos.
 */

// ---------------------------------------------------------------------------
// Creacion
// ---------------------------------------------------------------------------

/**
 * Calcula el precio de una orden sin crearla. Alimenta el paso "Resumen" del
 * asistente de reserva, para que el cliente vea el total antes de confirmar.
 */
async function quote({ planId, regionCode, pricingInput = {}, extraCodes = [] }) {
  const plan = await catalogRepo.findPlanById(planId);
  if (!plan) throw new NotFoundError('Plan de servicio', planId);

  const region = getRegion(regionCode ?? plan.region_code);
  const extras = await catalogRepo.findExtrasByCodes(extraCodes, region.code);

  return calculatePrice({
    plan,
    input: pricingInput,
    extras: extras.map((e) => ({ code: e.code, label: e.name, amount: e.amount })),
    region,
  });
}

/**
 * Crea una orden completa en una sola transaccion: cabecera, detalle del
 * servicio, primer registro de historial y notificaciones.
 */
async function createOrder({ serviceType, customer, payload, request }) {
  // Dos condiciones distintas: que el dominio lo implemente y que Operaciones
  // lo este ofreciendo. Desactivar un servicio en la pantalla de configuracion
  // tiene que cerrar tambien esta puerta, no solo ocultar el boton.
  await serviceCatalog.assertBookable(serviceType);

  const stateMachine = getStateMachine(serviceType);
  const region = getRegion(customer.region_code);

  // La direccion debe pertenecer al cliente: nunca se confia en el id recibido.
  const address = await addressRepo.findByIdForUser(payload.addressId, customer.id);
  if (!address) throw new NotFoundError('Direccion', payload.addressId);

  // Que el mapa devuelva un punto valido no significa que lo atendamos. Se
  // comprueba aqui, en el servidor, y no solo al guardar la direccion: la
  // cobertura pudo cambiar entre que se registro la casa y se reserva.
  const serviceArea = await addressService.assertServiceable(address);

  // La direccion de entrega se valida igual. Sin esta comprobacion un cliente
  // podria enlazar su pedido a la direccion de otra persona.
  let deliveryAddress = null;
  if (payload.deliveryAddressId) {
    deliveryAddress = await addressRepo.findByIdForUser(payload.deliveryAddressId, customer.id);
    if (!deliveryAddress) throw new NotFoundError('Direccion de entrega', payload.deliveryAddressId);
  }

  const plan = await catalogRepo.findPlanById(payload.planId);
  if (!plan || plan.service_type !== serviceType || !plan.active) {
    throw new NotFoundError('Plan de servicio', payload.planId);
  }

  const window = resolveTimeWindow({ windowCode: payload.windowCode, region });
  assertValidSchedule({
    scheduledDate: payload.scheduledDate,
    windowStart: window.startTime,
    region,
  });

  // Disponibilidad comercial: la empresa puede haber cerrado ese dia o esa
  // franja. Se comprueba aqui, no en React.
  await availability.assertBookableSlot({
    serviceType,
    regionCode: region.code,
    scheduledDate: payload.scheduledDate,
    windowStart: window.startTime,
    windowEnd: window.endTime,
  });

  const extras = await catalogRepo.findExtrasByCodes(payload.extraCodes ?? [], region.code);
  const pricing = calculatePrice({
    plan,
    input: payload.pricingInput ?? {},
    extras: extras.map((e) => ({ code: e.code, label: e.name, amount: e.amount })),
    region,
  });

  const extraMinutes = extras.reduce((sum, e) => sum + (e.added_duration_minutes ?? 0), 0);

  return db.tx(async (tx) => {
    const reference = await orderRepo.nextReference(tx);

    const order = await orderRepo.insertOrder(
      {
        reference,
        serviceType,
        customerId: customer.id,
        planId: plan.id,
        regionCode: region.code,
        // La zona vigente de la coordenada manda sobre la que se guardo el dia
        // que se creo la direccion: la cobertura la puede haber movido Operaciones.
        zoneId: serviceArea?.zoneId ?? address.zone_id ?? null,
        status: stateMachine.initialState,
        addressId: address.id,
        deliveryAddressId: deliveryAddress?.id ?? null,
        scheduledDate: payload.scheduledDate,
        scheduledWindowCode: window.code,
        scheduledWindowStart: window.startTime,
        scheduledWindowEnd: window.endTime,
        estimatedDurationMinutes:
          (payload.pricingInput?.durationMinutes ?? plan.estimated_duration_minutes ?? null) === null
            ? null
            : (payload.pricingInput?.durationMinutes ?? plan.estimated_duration_minutes) + extraMinutes,
        currency: pricing.currency,
        subtotalAmount: pricing.subtotal,
        discountAmount: pricing.discount,
        taxRate: pricing.taxRate,
        taxAmount: pricing.tax,
        totalAmount: pricing.total,
        priceBreakdown: pricing,
        requiresQuote: pricing.requiresQuote,
        customerNotes: payload.customerNotes ?? null,
      },
      tx,
    );

    if (serviceType === 'CLEANING') {
      await insertCleaningDetail(order.id, payload, region, tx);
    } else if (serviceType === 'LAUNDRY') {
      await insertLaundryDetail(order.id, payload, region, window, tx);
    }

    await orderRepo.insertStatusHistory(
      {
        orderId: order.id,
        fromStatus: null,
        toStatus: stateMachine.initialState,
        actorId: customer.id,
        actorRole: ROLES.CUSTOMER,
        note: 'Solicitud creada por el cliente',
      },
      tx,
    );

    await audit.record(
      {
        actor: customer,
        action: audit.ACTIONS.ORDER_CREATED,
        entityType: 'order',
        entityId: order.id,
        after: { reference, serviceType, status: order.status, total: pricing.total },
        request,
      },
      tx,
    );

    await notifications.emit(
      'ORDER_CREATED',
      { orderId: order.id, reference, customerId: customer.id },
      tx,
    );

    return order;
  });
}

async function insertCleaningDetail(orderId, payload, region, tx) {
  const d = payload.cleaning ?? {};
  return orderRepo.insertCleaningDetails(
    {
      orderId,
      cleaningType: d.cleaningType ?? 'STANDARD',
      propertyType: d.propertyType ?? 'APARTMENT',
      bedrooms: d.bedrooms ?? 0,
      bathrooms: d.bathrooms ?? 0,
      areaValue: d.areaValue ?? null,
      areaUnit: d.areaUnit ?? region.units.area,
      sizeTier: d.sizeTier ?? null,
      priorityAreas: d.priorityAreas ?? [],
      suppliesProvidedBy: d.suppliesProvidedBy ?? 'COMPANY',
      productPreferences: d.productPreferences ?? [],
      fragrancePreference: d.fragrancePreference ?? null,
      customerPresent: d.customerPresent ?? true,
      accessMethod: d.accessMethod ?? 'CUSTOMER_OPENS',
      accessInstructions: d.accessInstructions ?? null,
      // Codigos y ubicacion de llaves se cifran antes de tocar la base.
      accessSecretEncrypted: encrypt(d.accessSecret),
      parkingInstructions: d.parkingInstructions ?? null,
      hasPets: d.hasPets ?? false,
      pets: d.pets ?? [],
      petsSecured: d.petsSecured ?? null,
      petInstructions: d.petInstructions ?? null,
      delicateItems: d.delicateItems ?? null,
      specialInstructions: d.specialInstructions ?? null,
    },
    tx,
  );
}

async function insertLaundryDetail(orderId, payload, region, window, tx) {
  const d = payload.laundry ?? {};
  const deliveryWindow = d.deliveryWindowCode
    ? resolveTimeWindow({ windowCode: d.deliveryWindowCode, region })
    : null;

  return orderRepo.insertLaundryDetails(
    {
      orderId,
      serviceVariant: d.serviceVariant ?? 'WASH_AND_FOLD',
      pickupDate: payload.scheduledDate,
      pickupWindowCode: window.code,
      pickupWindowStart: window.startTime,
      pickupWindowEnd: window.endTime,
      pickupInstructions: d.pickupInstructions ?? null,
      deliveryDate: d.deliveryDate ?? null,
      deliveryWindowCode: deliveryWindow?.code ?? null,
      deliveryWindowStart: deliveryWindow?.startTime ?? null,
      deliveryWindowEnd: deliveryWindow?.endTime ?? null,
      deliveryInstructions: d.deliveryInstructions ?? null,
      estimatedBags: d.estimatedBags ?? null,
      estimatedWeight: d.estimatedWeight ?? null,
      weightUnit: d.weightUnit ?? region.units.weight,
      billingMode: d.billingMode ?? 'PER_WEIGHT',
      washTemperature: d.washTemperature ?? null,
      detergentPreference: d.detergentPreference ?? null,
      useFabricSoftener: d.useFabricSoftener ?? true,
      useBleach: d.useBleach ?? false,
      separateColors: d.separateColors ?? true,
      dryingPreference: d.dryingPreference ?? null,
      foldingPreference: d.foldingPreference ?? null,
      hangDryItems: d.hangDryItems ?? null,
      delicateItems: d.delicateItems ?? null,
      doNotProcessItems: d.doNotProcessItems ?? null,
      specialInstructions: d.specialInstructions ?? null,
    },
    tx,
  );
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/**
 * Devuelve la orden con la proyeccion que corresponde al rol que pregunta.
 * Aqui se aplica el principio de minimo privilegio:
 *
 *   CUSTOMER: todo lo suyo, pero del profesional solo la ficha publica.
 *   STAFF:    lo necesario para ejecutar el trabajo. Sin email del cliente,
 *             sin importes, sin notas internas.
 *   ADMIN:    todo.
 */
async function getOrderForActor(orderId, actor) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw new NotFoundError('Orden', orderId);

  // Lectura: incluye asignaciones ya completadas para que el trabajador
  // conserve el historial de los trabajos que hizo.
  const assignment =
    actor.role === ROLES.STAFF ? await assignmentRepo.findVisibleForStaff(orderId, actor.id) : null;

  if (actor.role === ROLES.CUSTOMER && order.customer_id !== actor.id) {
    // Se responde 404 y no 403 para no confirmar que la orden existe.
    throw new NotFoundError('Orden', orderId);
  }
  if (actor.role === ROLES.STAFF && !assignment) {
    throw new NotFoundError('Orden', orderId);
  }

  const [details, history, assignments] = await Promise.all([
    orderRepo.findDetails(orderId, order.service_type),
    orderRepo.findStatusHistory(orderId),
    orderRepo.findActiveAssignments(orderId),
  ]);

  const stateMachine = getStateMachine(order.service_type);
  const timeline = buildTimeline({ stateMachine, currentStatus: order.status, history });

  // El trabajador solo puede actuar mientras su asignacion siga viva.
  const hasActiveAssignment = ['OFFERED', 'ACCEPTED'].includes(assignment?.status);

  return {
    order: projectOrder(order, actor),
    details: projectDetails(details, order.service_type, actor, hasActiveAssignment),
    timeline,
    statusLabel: stateMachine.states[order.status]?.label ?? order.status,
    availableTransitions: stateMachine.allowedTransitions(order.status, actor.role),
    assignedStaff: assignments.map((a) => projectStaff(a, actor)),
    history: actor.role === ROLES.CUSTOMER ? undefined : history,
  };
}

function projectOrder(order, actor) {
  const base = {
    id: order.id,
    reference: order.reference,
    serviceType: order.service_type,
    status: order.status,
    scheduledDate: order.scheduled_date,
    scheduledWindowCode: order.scheduled_window_code,
    scheduledWindowStart: order.scheduled_window_start,
    scheduledWindowEnd: order.scheduled_window_end,
    estimatedDurationMinutes: order.estimated_duration_minutes,
    planName: order.plan_name,
    milestones: order.milestones,
    createdAt: order.created_at,
    address: {
      label: order.address_label,
      streetLine1: order.street_line1,
      streetLine2: order.street_line2,
      neighborhood: order.neighborhood,
      city: order.city,
      administrativeArea: order.administrative_area,
      postalCode: order.postal_code,
      reference: order.address_reference,
    },
  };

  // El trabajador no necesita saber cuanto pago el cliente ni sus datos de
  // contacto completos: solo el nombre y el telefono para coordinar el acceso.
  if (actor.role === ROLES.STAFF) {
    return {
      ...base,
      customer: {
        firstName: order.customer_first_name,
        phone: order.customer_phone,
      },
    };
  }

  const withMoney = {
    ...base,
    currency: order.currency,
    subtotalAmount: order.subtotal_amount,
    discountAmount: order.discount_amount,
    taxRate: order.tax_rate,
    taxAmount: order.tax_amount,
    totalAmount: order.total_amount,
    priceBreakdown: order.price_breakdown,
    paymentStatus: order.payment_status,
    customerNotes: order.customer_notes,
    cancelledReason: order.cancelled_reason,
  };

  if (actor.role === ROLES.ADMIN) {
    return {
      ...withMoney,
      internalNotes: order.internal_notes,
      zoneName: order.zone_name,
      customer: {
        id: order.customer_id,
        firstName: order.customer_first_name,
        lastName: order.customer_last_name,
        email: order.customer_email,
        phone: order.customer_phone,
      },
    };
  }

  return withMoney;
}

/**
 * El secreto de acceso (codigo de puerta, donde esta la llave) nunca viaja en
 * la respuesta normal. Se entrega solo bajo peticion explicita del trabajador
 * asignado, y esa consulta queda auditada. Ver revealAccessSecret().
 */
function projectDetails(details, serviceType, actor, hasActiveAssignment = false) {
  if (!details) return null;

  const { access_secret_encrypted: secret, ...rest } = details;

  if (serviceType === 'CLEANING') {
    return {
      ...rest,
      hasAccessSecret: Boolean(secret),
      // Solo el trabajador con asignacion viva puede pedirlo. El cliente ya
      // conoce su propio codigo y a Operaciones no le hace falta.
      canRevealAccessSecret: actor.role === ROLES.STAFF && hasActiveAssignment && Boolean(secret),
    };
  }

  return rest;
}

function projectStaff(assignment, actor) {
  const publicProfile = {
    id: assignment.staff_id,
    displayName: assignment.display_name ?? assignment.first_name,
    photoUrl: assignment.photo_url,
    bio: assignment.bio,
    isVerified: assignment.verification_status === 'VERIFIED',
    role: assignment.role,
    assignmentStatus: assignment.status,
  };

  // Solo Operaciones ve la identidad completa y el telefono del trabajador.
  if (actor.role === ROLES.ADMIN) {
    return {
      ...publicProfile,
      firstName: assignment.first_name,
      lastName: assignment.last_name,
      phone: assignment.phone,
      assignmentId: assignment.id,
    };
  }
  return publicProfile;
}

/**
 * Entrega el codigo de acceso al trabajador asignado y deja rastro de quien lo
 * consulto y cuando. Es informacion que abre la puerta de una casa: el acceso
 * tiene que ser trazable.
 */
async function revealAccessSecret(orderId, actor, request) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw new NotFoundError('Orden', orderId);

  if (actor.role === ROLES.STAFF) {
    const assignment = await assignmentRepo.findActiveForStaff(orderId, actor.id);
    if (!assignment) throw new NotFoundError('Orden', orderId);
  } else if (actor.role !== ROLES.ADMIN) {
    throw new ForbiddenError('No puedes consultar esta informacion');
  }

  const details = await orderRepo.findDetails(orderId, order.service_type);
  if (!details?.access_secret_encrypted) {
    return { accessSecret: null };
  }

  await audit.record({
    actor,
    action: audit.ACTIONS.ACCESS_SECRET_VIEWED,
    entityType: 'order',
    entityId: orderId,
    metadata: { reference: order.reference },
    request,
  });

  return { accessSecret: decrypt(details.access_secret_encrypted) };
}

// ---------------------------------------------------------------------------
// Transiciones de estado
// ---------------------------------------------------------------------------

/**
 * Cambia el estado de una orden validando la transicion contra la maquina de
 * estados y el rol del actor. Es el unico camino para mover una orden.
 */
async function transitionStatus({ orderId, toStatus, actor, note, request }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw new NotFoundError('Orden', orderId);

  const stateMachine = getStateMachine(order.service_type);

  // Autorizacion sobre el recurso, previa a la validez de la transicion.
  if (actor.role === ROLES.CUSTOMER && order.customer_id !== actor.id) {
    throw new NotFoundError('Orden', orderId);
  }
  if (actor.role === ROLES.STAFF) {
    const assignment = await assignmentRepo.findActiveForStaff(orderId, actor.id);
    if (!assignment) throw new NotFoundError('Orden', orderId);
    if (assignment.status !== 'ACCEPTED') {
      throw new ForbiddenError('Debes confirmar la asignacion antes de actualizar el servicio');
    }
  }

  // La maquina de estados decide si el movimiento es legal para este rol.
  const transition = stateMachine.assertTransition(order.status, toStatus, actor.role);

  return db.tx(async (tx) => {
    // Los timestamps declarados en la transicion se registran automaticamente.
    const milestones = {};
    for (const field of transition.timestamps ?? []) {
      milestones[field] = new Date().toISOString();
    }

    const updated = await orderRepo.updateStatus(orderId, { status: toStatus, milestones }, tx);

    await orderRepo.insertStatusHistory(
      {
        orderId,
        fromStatus: order.status,
        toStatus,
        actorId: actor.id,
        actorRole: actor.role,
        note,
      },
      tx,
    );

    if (toStatus === 'COMPLETED') {
      await assignmentRepo.complete(orderId, tx);
    }

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.ORDER_STATUS_CHANGED,
        entityType: 'order',
        entityId: orderId,
        before: { status: order.status },
        after: { status: toStatus },
        metadata: { reference: order.reference, note: note ?? null },
        request,
      },
      tx,
    );

    const assignment = await assignmentRepo.findActiveForOrder(orderId, 'PRIMARY', tx);
    const eventCode = notifications.eventForStatus(order.service_type, toStatus);
    if (eventCode) {
      await notifications.emit(
        eventCode,
        {
          orderId,
          reference: order.reference,
          customerId: order.customer_id,
          staffId: assignment?.staff_id ?? null,
          staffName: actor.role === ROLES.STAFF ? actor.first_name : null,
        },
        tx,
      );
    }

    return updated;
  });
}

/**
 * Cancelacion. Aplica la politica horaria de la region y marca la cancelacion
 * como tardia cuando corresponde, sin bloquearla.
 */
async function cancelOrder({ orderId, actor, reason, request }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw new NotFoundError('Orden', orderId);

  if (actor.role === ROLES.CUSTOMER && order.customer_id !== actor.id) {
    throw new NotFoundError('Orden', orderId);
  }

  const region = getRegion(order.region_code);
  const evaluation = evaluateCancellation({ order, region });

  await transitionStatus({ orderId, toStatus: 'CANCELLED', actor, note: reason, request });

  await db.tx(async (tx) => {
    await orderRepo.markCancelled(orderId, { reason, cancelledBy: actor.id }, tx);
    await audit.record(
      {
        actor,
        action: audit.ACTIONS.ORDER_CANCELLED,
        entityType: 'order',
        entityId: orderId,
        metadata: { reference: order.reference, reason, late: evaluation.late },
        request,
      },
      tx,
    );
  });

  return { cancelled: true, ...evaluation };
}

// ---------------------------------------------------------------------------
// Listados
// ---------------------------------------------------------------------------

async function listForCustomer(customerId, filters) {
  const result = await orderRepo.search({ ...filters, customerId });
  return { ...result, data: result.data.map((o) => summarize(o)) };
}

async function listForStaff(staffId, filters) {
  const result = await orderRepo.search({ ...filters, staffId });
  return { ...result, data: result.data.map((o) => summarize(o, { hideMoney: true })) };
}

async function listForOperations(filters) {
  const result = await orderRepo.search(filters);
  const withAssignments = await Promise.all(
    result.data.map(async (order) => {
      const assignments = await orderRepo.findActiveAssignments(order.id);
      return {
        ...summarize(order),
        customerName: `${order.customer_first_name} ${order.customer_last_name}`,
        zoneName: order.zone_name,
        assignedStaff: assignments.map((a) => ({
          id: a.staff_id,
          name: `${a.first_name} ${a.last_name}`,
          role: a.role,
          status: a.status,
        })),
      };
    }),
  );
  return { ...result, data: withAssignments };
}

/** Proyeccion compacta para listados y tarjetas. */
function summarize(order, { hideMoney = false } = {}) {
  const stateMachine = getStateMachine(order.service_type);
  return {
    id: order.id,
    reference: order.reference,
    serviceType: order.service_type,
    status: order.status,
    statusLabel: stateMachine.states[order.status]?.label ?? order.status,
    isTerminal: stateMachine.isTerminal(order.status),
    planName: order.plan_name,
    scheduledDate: order.scheduled_date,
    scheduledWindowStart: order.scheduled_window_start,
    scheduledWindowEnd: order.scheduled_window_end,
    city: order.city,
    neighborhood: order.neighborhood,
    streetLine1: order.street_line1,
    createdAt: order.created_at,
    ...(hideMoney ? {} : { currency: order.currency, totalAmount: order.total_amount }),
  };
}

async function operationsSummary(date) {
  return orderRepo.operationsSummary(date ?? new Date().toISOString().slice(0, 10));
}

module.exports = {
  quote,
  createOrder,
  getOrderForActor,
  revealAccessSecret,
  transitionStatus,
  cancelOrder,
  listForCustomer,
  listForStaff,
  listForOperations,
  operationsSummary,
  summarize,
};
