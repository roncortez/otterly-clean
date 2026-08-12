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

module.exports = { getOperationsOverview };
