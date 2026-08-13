'use strict';

const { db } = require('../index');

/**
 * Acceso a datos de ordenes.
 *
 * Las ordenes comparten tabla entre servicios; el detalle especifico vive en
 * cleaning_details / laundry_details y se une segun `service_type`.
 */

/** Genera la referencia legible: OC-2026-001234 */
async function nextReference(tx = db) {
  const { nextval } = await tx.one("SELECT nextval('order_reference_seq') AS nextval");
  return `OC-${new Date().getFullYear()}-${String(nextval).padStart(6, '0')}`;
}

async function nextBagCode(orderReference, tx = db) {
  const { nextval } = await tx.one("SELECT nextval('bag_reference_seq') AS nextval");
  return `${orderReference}-B${String(nextval).padStart(4, '0')}`;
}

async function insertOrder(order, tx = db) {
  return tx.one(
    `INSERT INTO orders (
       reference, service_type, customer_id, plan_id, region_code, zone_id, status,
       address_id, delivery_address_id, property_id,
       scheduled_date, scheduled_window_code, scheduled_window_start, scheduled_window_end,
       estimated_duration_minutes,
       currency, subtotal_amount, discount_amount, tax_rate, tax_amount, total_amount,
       price_breakdown, requires_quote, customer_notes
     ) VALUES (
       $[reference], $[serviceType], $[customerId], $[planId], $[regionCode], $[zoneId], $[status],
       $[addressId], $[deliveryAddressId], $[propertyId],
       $[scheduledDate], $[scheduledWindowCode], $[scheduledWindowStart], $[scheduledWindowEnd],
       $[estimatedDurationMinutes],
       $[currency], $[subtotalAmount], $[discountAmount], $[taxRate], $[taxAmount], $[totalAmount],
       $[priceBreakdown:json], $[requiresQuote], $[customerNotes]
     ) RETURNING *`,
    order,
  );
}

async function insertCleaningDetails(details, tx = db) {
  return tx.one(
    `INSERT INTO cleaning_details (
       order_id, cleaning_type, property_type, bedrooms, bathrooms,
       area_value, area_unit, size_tier, priority_areas,
       supplies_provided_by, product_preferences, fragrance_preference,
       customer_present, access_method, access_instructions, access_secret_encrypted,
       parking_instructions,
       has_pets, pets, pets_secured, pet_instructions,
       delicate_items, special_instructions
     ) VALUES (
       $[orderId], $[cleaningType], $[propertyType], $[bedrooms], $[bathrooms],
       $[areaValue], $[areaUnit], $[sizeTier], $[priorityAreas],
       $[suppliesProvidedBy], $[productPreferences], $[fragrancePreference],
       $[customerPresent], $[accessMethod], $[accessInstructions], $[accessSecretEncrypted],
       $[parkingInstructions],
       $[hasPets], $[pets:json], $[petsSecured], $[petInstructions],
       $[delicateItems], $[specialInstructions]
     ) RETURNING *`,
    details,
  );
}

async function insertLaundryDetails(details, tx = db) {
  return tx.one(
    `INSERT INTO laundry_details (
       order_id, service_variant,
       pickup_date, pickup_window_code, pickup_window_start, pickup_window_end, pickup_instructions,
       delivery_date, delivery_window_code, delivery_window_start, delivery_window_end, delivery_instructions,
       estimated_bags, estimated_weight, weight_unit, billing_mode,
       wash_temperature, detergent_preference, use_fabric_softener, use_bleach,
       separate_colors, drying_preference, folding_preference,
       hang_dry_items, delicate_items, do_not_process_items, special_instructions
     ) VALUES (
       $[orderId], $[serviceVariant],
       $[pickupDate], $[pickupWindowCode], $[pickupWindowStart], $[pickupWindowEnd], $[pickupInstructions],
       $[deliveryDate], $[deliveryWindowCode], $[deliveryWindowStart], $[deliveryWindowEnd], $[deliveryInstructions],
       $[estimatedBags], $[estimatedWeight], $[weightUnit], $[billingMode],
       $[washTemperature], $[detergentPreference], $[useFabricSoftener], $[useBleach],
       $[separateColors], $[dryingPreference], $[foldingPreference],
       $[hangDryItems], $[delicateItems], $[doNotProcessItems], $[specialInstructions]
     ) RETURNING *`,
    details,
  );
}

/** Datos base de la orden + cliente + direccion. Sin detalle de servicio. */
const ORDER_BASE_QUERY = `
  SELECT o.*,
         c.first_name  AS customer_first_name,
         c.last_name   AS customer_last_name,
         c.email       AS customer_email,
         c.phone       AS customer_phone,
         p.name        AS plan_name,
         p.pricing_model,
         z.name        AS zone_name,
         a.label       AS address_label,
         a.street_line1, a.street_line2, a.neighborhood, a.city,
         a.administrative_area, a.postal_code, a.reference AS address_reference,
         a.latitude, a.longitude,
         prop.name        AS property_name,
         prop.property_type AS property_type
    FROM orders o
    JOIN users c          ON c.id = o.customer_id
    LEFT JOIN service_plans p ON p.id = o.plan_id
    LEFT JOIN service_zones z ON z.id = o.zone_id
    LEFT JOIN addresses a     ON a.id = o.address_id
    LEFT JOIN properties prop ON prop.id = o.property_id
`;

async function findById(id, tx = db) {
  return tx.oneOrNone(`${ORDER_BASE_QUERY} WHERE o.id = $1`, [id]);
}

async function findByReference(reference, tx = db) {
  return tx.oneOrNone(`${ORDER_BASE_QUERY} WHERE o.reference = $1`, [reference]);
}

async function findDetails(orderId, serviceType, tx = db) {
  const table =
    serviceType === 'CLEANING'
      ? 'cleaning_details'
      : serviceType === 'LAUNDRY'
        ? 'laundry_details'
        : 'alteration_details';
  return tx.oneOrNone(`SELECT * FROM ${table} WHERE order_id = $1`, [orderId]);
}

async function findStatusHistory(orderId, tx = db) {
  return tx.any(
    `SELECT h.*, u.first_name AS actor_first_name, u.last_name AS actor_last_name
       FROM order_status_history h
       LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.order_id = $1
      ORDER BY h.created_at ASC, h.id ASC`,
    [orderId],
  );
}

/**
 * Asignacion vigente con los datos publicos del profesional.
 *
 * Incluye COMPLETED a proposito: cuando el servicio termina, el cliente debe
 * seguir viendo quien lo atendio. Solo se excluyen las que no llegaron a
 * ejecutarse (rechazadas o liberadas por una reasignacion).
 */
async function findActiveAssignments(orderId, tx = db) {
  return tx.any(
    `SELECT a.*,
            u.first_name, u.last_name, u.phone,
            sp.display_name, sp.photo_url, sp.bio, sp.verification_status
       FROM assignments a
       JOIN users u ON u.id = a.staff_id
       LEFT JOIN staff_profiles sp ON sp.user_id = a.staff_id
      WHERE a.order_id = $1 AND a.status IN ('OFFERED', 'ACCEPTED', 'COMPLETED')
      ORDER BY a.assigned_at DESC`,
    [orderId],
  );
}

async function updateStatus(orderId, { status, milestones }, tx = db) {
  return tx.one(
    `UPDATE orders
        SET status = $2,
            milestones = milestones || $3:json,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [orderId, status, milestones ?? {}],
  );
}

async function insertStatusHistory(
  { orderId, fromStatus, toStatus, actorId, actorRole, note, metadata = {} },
  tx = db,
) {
  return tx.one(
    `INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, actor_role, note, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7:json)
     RETURNING *`,
    [orderId, fromStatus, toStatus, actorId, actorRole, note ?? null, metadata],
  );
}

async function markCancelled(orderId, { reason, cancelledBy }, tx = db) {
  return tx.none(
    'UPDATE orders SET cancelled_reason = $2, cancelled_by = $3, updated_at = NOW() WHERE id = $1',
    [orderId, reason ?? null, cancelledBy ?? null],
  );
}

/**
 * Busqueda de ordenes con filtros. Es la consulta que alimenta tanto el
 * historial del cliente como la cola de Operaciones.
 *
 * `unassignedOnly` responde a "que servicios estan sin asignar", que es la
 * pregunta mas frecuente del dia a dia operativo.
 */
async function search(
  {
    customerId,
    staffId,
    serviceType,
    status,
    statuses,
    from,
    to,
    scheduledDate,
    unassignedOnly,
    activeOnly,
    search: term,
    page = 1,
    limit = 20,
  },
  tx = db,
) {
  const conditions = [];
  const values = [];

  const push = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (customerId) conditions.push(`o.customer_id = ${push(customerId)}`);
  if (serviceType) conditions.push(`o.service_type = ${push(serviceType)}`);
  if (status) conditions.push(`o.status = ${push(status)}`);
  if (statuses?.length) conditions.push(`o.status = ANY(${push(statuses)})`);
  if (scheduledDate) conditions.push(`o.scheduled_date = ${push(scheduledDate)}::date`);
  if (from) conditions.push(`o.scheduled_date >= ${push(from)}::date`);
  if (to) conditions.push(`o.scheduled_date <= ${push(to)}::date`);
  if (term) {
    const p = push(`%${term}%`);
    conditions.push(`(o.reference ILIKE ${p} OR c.first_name ILIKE ${p} OR c.last_name ILIKE ${p})`);
  }

  if (staffId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM assignments sa
                WHERE sa.order_id = o.id AND sa.staff_id = ${push(staffId)}
                  AND sa.status IN ('OFFERED', 'ACCEPTED'))`,
    );
  }

  if (unassignedOnly) {
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM assignments ua
                    WHERE ua.order_id = o.id AND ua.status IN ('OFFERED', 'ACCEPTED'))`,
    );
  }

  // "Activo" = ni terminado ni cancelado, para el dashboard.
  if (activeOnly) {
    conditions.push(`o.status NOT IN ('COMPLETED', 'CANCELLED')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const limitParam = push(limit);
  const offsetParam = push(offset);

  // Secuencial, no en paralelo: una misma conexion no puede ejecutar dos
  // consultas a la vez (pg lo deprecio y fallara en pg@9).
  const [rows, count] = await tx.task(async (t) => [
    await t.any(
      `${ORDER_BASE_QUERY} ${where}
        ORDER BY o.scheduled_date NULLS LAST, o.scheduled_window_start NULLS LAST, o.created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    ),
    await t.one(
      `SELECT COUNT(*)::int AS total FROM orders o JOIN users c ON c.id = o.customer_id ${where}`,
      values.slice(0, -2),
    ),
  ]);

  return {
    data: rows,
    pagination: { page, limit, total: count.total, totalPages: Math.ceil(count.total / limit) },
  };
}

/** Metricas del dia para el panel de Operaciones. */
async function operationsSummary(date, tx = db) {
  const [byStatus, byService, unassigned, openIncidents, activeStaff] = await tx.task(async (t) => [
    await t.any(
      `SELECT status, COUNT(*)::int AS count FROM orders
        WHERE scheduled_date = $1::date GROUP BY status`,
      [date],
    ),
    await t.any(
      `SELECT service_type, COUNT(*)::int AS count FROM orders
        WHERE scheduled_date = $1::date GROUP BY service_type`,
      [date],
    ),
    await t.one(
      `SELECT COUNT(*)::int AS count FROM orders o
        WHERE o.scheduled_date = $1::date
          AND o.status NOT IN ('COMPLETED', 'CANCELLED')
          AND NOT EXISTS (SELECT 1 FROM assignments a
                           WHERE a.order_id = o.id AND a.status IN ('OFFERED', 'ACCEPTED'))`,
      [date],
    ),
    await t.one(
      `SELECT COUNT(*)::int AS count FROM incidents WHERE status IN ('OPEN', 'IN_REVIEW')`,
    ),
    await t.one(
      `SELECT COUNT(DISTINCT a.staff_id)::int AS count
         FROM assignments a
         JOIN orders o ON o.id = a.order_id
        WHERE o.scheduled_date = $1::date AND a.status = 'ACCEPTED'`,
      [date],
    ),
  ]);

  return {
    date,
    byStatus,
    byService,
    unassigned: unassigned.count,
    openIncidents: openIncidents.count,
    activeStaff: activeStaff.count,
  };
}

module.exports = {
  nextReference,
  nextBagCode,
  insertOrder,
  insertCleaningDetails,
  insertLaundryDetails,
  findById,
  findByReference,
  findDetails,
  findStatusHistory,
  findActiveAssignments,
  updateStatus,
  insertStatusHistory,
  markCancelled,
  search,
  operationsSummary,
};
