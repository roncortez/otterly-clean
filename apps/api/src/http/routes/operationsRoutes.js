'use strict';

const express = require('express');
const { z } = require('zod');
const orderService = require('../../services/orderService');
const assignmentService = require('../../services/assignmentService');
const staffService = require('../../services/staffService');
const incidentService = require('../../services/incidentService');
const laundryBagService = require('../../services/laundryBagService');
const userRepository = require('../../db/repositories/userRepository');
const catalogRepo = require('../../db/repositories/catalogRepository');
const audit = require('../../services/auditService');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/validate');
const { ROLES } = require('../../domain/shared/roles');
const schemas = require('../schemas');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN));

// ---------------------------------------------------------------------------
// Panel operativo
// ---------------------------------------------------------------------------

/**
 * GET /api/operations/dashboard
 * Responde de un vistazo las preguntas del dia a dia: que hay hoy, que esta
 * sin asignar, quien esta trabajando y que tiene problemas.
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);

    const [summary, unassigned, incidents, active] = await Promise.all([
      orderService.operationsSummary(date),
      orderService.listForOperations({ scheduledDate: date, unassignedOnly: true, activeOnly: true, limit: 50 }),
      incidentService.listOpen({ limit: 20 }),
      orderService.listForOperations({ scheduledDate: date, activeOnly: true, limit: 100 }),
    ]);

    res.json({
      summary,
      unassigned: unassigned.data,
      openIncidents: incidents,
      todayOrders: active.data,
    });
  }),
);

// ---------------------------------------------------------------------------
// Ordenes
// ---------------------------------------------------------------------------

router.get(
  '/orders',
  validate({ query: schemas.orderQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await orderService.listForOperations(req.validatedQuery));
  }),
);

router.get(
  '/orders/:id',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    const [detail, assignments, incidents, bags, auditTrail] = await Promise.all([
      orderService.getOrderForActor(req.validatedParams.id, req.user),
      assignmentService.listForOrder(req.validatedParams.id),
      incidentService.listForOrder(req.validatedParams.id),
      laundryBagService.listForOrder(req.validatedParams.id),
      audit.listForEntity('order', req.validatedParams.id, { limit: 30 }),
    ]);
    res.json({ ...detail, assignments, incidents, bags, auditTrail });
  }),
);

/** Candidatos sugeridos para atender la orden, con su carga del dia. */
router.get(
  '/orders/:id/candidates',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ candidates: await assignmentService.listCandidates(req.validatedParams.id) });
  }),
);

/** POST /api/operations/orders/:id/assign — asignar o reasignar. */
router.post(
  '/orders/:id/assign',
  validate({ params: schemas.idParamSchema, body: schemas.assignSchema }),
  asyncHandler(async (req, res) => {
    const assignment = await assignmentService.assignStaff({
      orderId: req.validatedParams.id,
      staffId: req.body.staffId,
      role: req.body.role,
      notes: req.body.notes,
      actor: req.user,
      request: req,
    });
    res.status(201).json({ assignment });
  }),
);

/** Operaciones puede corregir el estado cuando la realidad se desvia. */
router.post(
  '/orders/:id/status',
  validate({ params: schemas.idParamSchema, body: schemas.transitionSchema }),
  asyncHandler(async (req, res) => {
    const order = await orderService.transitionStatus({
      orderId: req.validatedParams.id,
      toStatus: req.body.status,
      actor: req.user,
      note: req.body.note,
      request: req,
    });
    res.json({ order: orderService.summarize(order) });
  }),
);

router.post(
  '/orders/:id/cancel',
  validate({ params: schemas.idParamSchema, body: schemas.cancelSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await orderService.cancelOrder({
        orderId: req.validatedParams.id,
        actor: req.user,
        reason: req.body.reason,
        request: req,
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Trabajadores
// ---------------------------------------------------------------------------

router.get(
  '/staff',
  asyncHandler(async (req, res) => {
    res.json({
      staff: await staffService.list({
        active: req.query.active === undefined ? undefined : req.query.active === 'true',
        verificationStatus: req.query.verificationStatus,
        serviceType: req.query.serviceType,
        search: req.query.search,
        date: req.query.date,
      }),
    });
  }),
);

router.get(
  '/staff/:id',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ staff: await staffService.getAdminProfile(req.validatedParams.id) });
  }),
);

/** Las cuentas de trabajador las crea la empresa, nunca un registro publico. */
router.post(
  '/staff',
  validate({ body: schemas.createStaffSchema }),
  asyncHandler(async (req, res) => {
    const staff = await staffService.createStaff({
      payload: req.body,
      actor: req.user,
      request: req,
    });
    res.status(201).json({ staff });
  }),
);

router.patch(
  '/staff/:id',
  validate({ params: schemas.idParamSchema, body: schemas.updateStaffSchema }),
  asyncHandler(async (req, res) => {
    const staff = await staffService.updateStaff({
      staffId: req.validatedParams.id,
      payload: req.body,
      actor: req.user,
      request: req,
    });
    res.json({ staff });
  }),
);

router.post(
  '/staff/:id/verification',
  validate({ params: schemas.idParamSchema, body: schemas.verificationSchema }),
  asyncHandler(async (req, res) => {
    const staff = await staffService.setVerification({
      staffId: req.validatedParams.id,
      status: req.body.status,
      actor: req.user,
      request: req,
    });
    res.json({ staff });
  }),
);

/** Desactivar, no borrar: la trazabilidad historica debe sobrevivir. */
router.post(
  '/staff/:id/active',
  validate({ params: schemas.idParamSchema, body: z.object({ active: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const staff = await staffService.setActive({
      staffId: req.validatedParams.id,
      active: req.body.active,
      actor: req.user,
      request: req,
    });
    res.json({ staff });
  }),
);

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

router.get(
  '/customers',
  validate({ query: schemas.paginationSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await userRepository.list({
        role: ROLES.CUSTOMER,
        search: req.query.search,
        ...req.validatedQuery,
      }),
    );
  }),
);

router.get(
  '/customers/:id',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    const customer = await userRepository.findById(req.validatedParams.id);
    const orders = await orderService.listForOperations({
      customerId: req.validatedParams.id,
      limit: 20,
    });
    res.json({ customer, orders: orders.data });
  }),
);

// ---------------------------------------------------------------------------
// Incidencias
// ---------------------------------------------------------------------------

router.get(
  '/incidents',
  asyncHandler(async (req, res) => {
    res.json({ incidents: await incidentService.listOpen({ status: req.query.status }) });
  }),
);

router.post(
  '/incidents/:id/resolve',
  validate({ params: schemas.idParamSchema, body: schemas.resolveIncidentSchema }),
  asyncHandler(async (req, res) => {
    const incident = await incidentService.resolve({
      incidentId: req.validatedParams.id,
      actor: req.user,
      payload: req.body,
      request: req,
    });
    res.json({ incident });
  }),
);

// ---------------------------------------------------------------------------
// Zonas de cobertura
// ---------------------------------------------------------------------------

router.get(
  '/zones',
  asyncHandler(async (req, res) => {
    res.json({
      zones: await catalogRepo.listZones({
        regionCode: req.query.region ?? req.user.region_code,
        includeInactive: true,
      }),
    });
  }),
);

router.post(
  '/zones',
  validate({
    body: z.object({
      code: z.string().trim().min(1).max(40),
      name: z.string().trim().min(1).max(120),
      city: z.string().trim().min(1).max(120),
      administrativeArea: z.string().trim().max(120).optional(),
      regionCode: z.enum(['EC', 'US']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const zone = await catalogRepo.createZone({
      ...req.body,
      regionCode: req.body.regionCode ?? req.user.region_code,
    });
    res.status(201).json({ zone });
  }),
);

router.post(
  '/zones/:id/active',
  validate({ params: schemas.idParamSchema, body: z.object({ active: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    res.json({ zone: await catalogRepo.setZoneActive(req.validatedParams.id, req.body.active) });
  }),
);

// ---------------------------------------------------------------------------
// Cupones (Administracion)
// ---------------------------------------------------------------------------

const couponService = require('../../services/couponService');
const settingsService = require('../../services/settingsService');
const statsService = require('../../services/statsService');

router.get(
  '/coupons',
  asyncHandler(async (req, res) => {
    res.json({ coupons: await couponService.listCoupons(req.query) });
  }),
);

router.post(
  '/coupons',
  asyncHandler(async (req, res) => {
    const coupon = await couponService.createCoupon(req.body, req.user.id);
    res.status(201).json({ coupon });
  }),
);

router.patch(
  '/coupons/:id/status',
  asyncHandler(async (req, res) => {
    const coupon = await couponService.toggleCoupon(Number(req.params.id), req.body.active);
    res.json({ coupon });
  }),
);

// ---------------------------------------------------------------------------
// Configuracion y Banners (Administracion)
// ---------------------------------------------------------------------------

router.get(
  '/settings/banner',
  asyncHandler(async (req, res) => {
    res.json({ banner: await settingsService.getBanner() });
  }),
);

router.post(
  '/settings/banner',
  asyncHandler(async (req, res) => {
    const banner = await settingsService.updateBanner(req.body);
    res.json({ banner });
  }),
);

// ---------------------------------------------------------------------------
// Estadisticas Operativas
// ---------------------------------------------------------------------------

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json({ overview: await statsService.getOperationsOverview() });
  }),
);

module.exports = router;
