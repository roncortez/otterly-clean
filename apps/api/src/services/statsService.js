'use strict';

const { db } = require('../db');

async function getOperationsOverview() {
  const [ordersSummary, revenueSummary, topServices, couponsUsed] = await Promise.all([
    db.one(
      `SELECT
         COUNT(*) AS total_orders,
         COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_orders,
         COUNT(*) FILTER (WHERE status IN ('REQUESTED', 'PENDING_ASSIGNMENT')) AS pending_assignment,
         COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_orders
       FROM orders`,
    ),
    db.one(
      `SELECT
         COALESCE(SUM(total_amount), 0) AS total_revenue,
         COALESCE(SUM(tax_amount), 0) AS total_tax
       FROM orders WHERE status = 'COMPLETED'`,
    ),
    db.any(
      `SELECT service_type, COUNT(*) AS count
       FROM orders GROUP BY service_type ORDER BY count DESC`,
    ),
    db.one(
      `SELECT COUNT(*) AS total_coupons_applied FROM cupones_uso`,
    ),
  ]);

  return {
    orders: {
      total: Number(ordersSummary.total_orders),
      completed: Number(ordersSummary.completed_orders),
      pendingAssignment: Number(ordersSummary.pending_assignment),
      cancelled: Number(ordersSummary.cancelled_orders),
    },
    financials: {
      totalRevenue: Number(revenueSummary.total_revenue),
      totalTax: Number(revenueSummary.total_tax),
    },
    servicesBreakdown: topServices,
    couponsApplied: Number(couponsUsed.total_coupons_applied),
  };
}

/**
 * Resumen del cliente para su pantalla de inicio.
 *
 * Pocas cifras y todas calculables: cuantos servicios tiene en marcha, cuantos
 * ha completado, cuando es el proximo y cuanto lleva gastado en los que
 * terminaron. No hay medias, ni tendencias, ni comparativas con el mes pasado:
 * eso exigiria decidir que cuenta como "mes" y de que sirve, y hoy no sirve de
 * nada.
 *
 * "Activo" es lo contrario de terminal, y los estados terminales los declara el
 * dominio (`stateMachine.isTerminal`). Aqui se enumeran los tres que lo son en
 * las tres maquinas -COMPLETED, DELIVERED y CANCELLED- porque una consulta SQL
 * no puede llamar al dominio; si se anade un estado final nuevo hay que tocar
 * esta lista, y por eso esta escrita en un solo sitio.
 *
 * El gasto sale de `total_amount` de las ordenes COMPLETED: lo acordado en
 * ordenes que se prestaron. Las canceladas no cuentan y las que siguen en curso
 * tampoco, porque su precio todavia puede cambiar.
 */
const TERMINAL_STATUSES = ['COMPLETED', 'DELIVERED', 'CANCELLED'];

async function getCustomerOverview(customerId) {
  const [counts, next] = await Promise.all([
    db.one(
      `SELECT
         COUNT(*) FILTER (WHERE status <> ALL($2))          AS active,
         COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'DELIVERED')) AS completed,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'COMPLETED'), 0) AS spent,
         COUNT(*) FILTER (WHERE service_type = 'LAUNDRY')   AS laundry
       FROM orders WHERE customer_id = $1`,
      [customerId, TERMINAL_STATUSES],
    ),
    db.oneOrNone(
      `SELECT id, reference, service_type, scheduled_date
         FROM orders
        WHERE customer_id = $1
          AND status <> ALL($2)
          AND scheduled_date >= CURRENT_DATE
        ORDER BY scheduled_date, scheduled_window_start
        LIMIT 1`,
      [customerId, TERMINAL_STATUSES],
    ),
  ]);

  return {
    activeOrders: Number(counts.active),
    completedOrders: Number(counts.completed),
    laundryOrders: Number(counts.laundry),
    // En centavos, como todo importe: la interfaz lo formatea con su moneda.
    totalSpent: Number(counts.spent),
    nextOrder: next
      ? {
          id: next.id,
          reference: next.reference,
          serviceType: next.service_type,
          scheduledDate: next.scheduled_date,
        }
      : null,
  };
}

module.exports = { getOperationsOverview, getCustomerOverview };
