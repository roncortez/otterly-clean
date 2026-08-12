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
// Usuarios y roles
//
// Una persona puede tener varios roles: quien coordina la operacion tambien
// puede salir a trabajar. Los roles se envian como conjunto completo y el
// servicio impide que el sistema se quede sin administradores activos.
// ---------------------------------------------------------------------------

const userService = require('../../services/userService');

router.get(
  '/users',
  validate({ query: schemas.userQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await userService.list(req.validatedQuery));
  }),
);

router.get(
  '/users/:id',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ user: await userService.getById(req.validatedParams.id) });
  }),
);

router.put(
  '/users/:id/roles',
  validate({ params: schemas.idParamSchema, body: schemas.updateRolesSchema }),
  asyncHandler(async (req, res) => {
    const user = await userService.updateRoles({
      userId: req.validatedParams.id,
      roles: req.body.roles,
      actor: req.user,
      request: req,
    });
    res.json({ user });
  }),
);

router.post(
  '/users/:id/status',
  validate({ params: schemas.idParamSchema, body: z.object({ active: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const user = await userService.setStatus({
      userId: req.validatedParams.id,
      active: req.body.active,
      actor: req.user,
      request: req,
    });
    res.json({ user });
  }),
);

// ---------------------------------------------------------------------------
// Configuracion: empresa
// ---------------------------------------------------------------------------

const companyService = require('../../services/companyService');

router.get(
  '/settings/company',
  asyncHandler(async (_req, res) => {
    res.json({ company: await companyService.get() });
  }),
);

router.patch(
  '/settings/company',
  validate({ body: schemas.companySettingsSchema }),
  asyncHandler(async (req, res) => {
    const company = await companyService.update({
      payload: req.body,
      actor: req.user,
      request: req,
    });
    res.json({ company });
  }),
);

// ---------------------------------------------------------------------------
// Configuracion: servicios
//
// Los tres tipos son fijos. Aqui se administra su capa comercial (si se
// ofrecen, como se presentan y a que precio), nunca su maquina de estados.
// ---------------------------------------------------------------------------

const serviceCatalogService = require('../../services/serviceCatalogService');

router.get(
  '/services',
  asyncHandler(async (req, res) => {
    const regionCode = (req.query.region ?? req.user.region_code).toUpperCase();
    res.json({
      regionCode,
      services: await serviceCatalogService.listForOperations(regionCode),
    });
  }),
);

router.patch(
  '/services/:serviceType',
  validate({ params: schemas.serviceTypeParamSchema, body: schemas.serviceSettingsSchema }),
  asyncHandler(async (req, res) => {
    const service = await serviceCatalogService.updateSettings({
      serviceType: req.validatedParams.serviceType,
      payload: req.body,
      actor: req.user,
      request: req,
    });
    res.json({ service });
  }),
);

/** Parametros de precio del plan, dentro del modelo que ya tiene asignado. */
router.patch(
  '/services/:serviceType/plans/:planId',
  validate({ params: schemas.planParamSchema, body: schemas.servicePlanSchema }),
  asyncHandler(async (req, res) => {
    const plan = await serviceCatalogService.updatePlan({
      serviceType: req.validatedParams.serviceType,
      planId: req.validatedParams.planId,
      payload: req.body,
      actor: req.user,
      request: req,
    });
    res.json({ plan });
  }),
);

// ---------------------------------------------------------------------------
// Configuracion: disponibilidad de la agenda
//
// Distinto de staff_availability: esto es cuando acepta reservas la empresa,
// no cuando puede trabajar una persona.
// ---------------------------------------------------------------------------

const availabilityService = require('../../services/availabilityService');

router.get(
  '/booking-blackouts',
  asyncHandler(async (req, res) => {
    res.json({
      blackouts: await availabilityService.list({
        regionCode: (req.query.region ?? req.user.region_code).toUpperCase(),
        includeInactive: true,
        serviceType: req.query.serviceType,
      }),
    });
  }),
);

router.post(
  '/booking-blackouts',
  validate({ body: schemas.blackoutSchema }),
  asyncHandler(async (req, res) => {
    const blackout = await availabilityService.create({
      payload: req.body,
      actor: req.user,
      request: req,
    });
    res.status(201).json({ blackout });
  }),
);

router.patch(
  '/booking-blackouts/:id',
  validate({ params: schemas.idParamSchema, body: schemas.updateBlackoutSchema }),
  asyncHandler(async (req, res) => {
    const blackout = await availabilityService.update({
      blackoutId: req.validatedParams.id,
      payload: req.body,
      actor: req.user,
      request: req,
    });
    res.json({ blackout });
  }),
);

router.delete(
  '/booking-blackouts/:id',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    await availabilityService.remove({
      blackoutId: req.validatedParams.id,
      actor: req.user,
      request: req,
    });
    res.status(204).send();
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
