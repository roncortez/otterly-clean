'use strict';

const express = require('express');
const orderService = require('../../services/orderService');
const assignmentService = require('../../services/assignmentService');
const incidentService = require('../../services/incidentService');
const laundryBagService = require('../../services/laundryBagService');
const notifications = require('../../notifications');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/validate');
const { ROLES } = require('../../domain/shared/roles');
const schemas = require('../schemas');
const { z } = require('zod');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.STAFF));

/**
 * Rutas del trabajador.
 *
 * NO existe ningun endpoint para buscar trabajos disponibles ni para
 * autoasignarse: el trabajador solo ve lo que Operaciones le entrego. Todas
 * las consultas se filtran por su propia asignacion.
 */

/** GET /api/staff/jobs — trabajos asignados, filtrables por dia. */
router.get(
  '/jobs',
  validate({ query: schemas.orderQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await orderService.listForStaff(req.user.id, req.validatedQuery));
  }),
);

/** GET /api/staff/jobs/today — la pantalla principal del trabajador. */
router.get(
  '/jobs/today',
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const [todayJobs, upcoming] = await Promise.all([
      orderService.listForStaff(req.user.id, { scheduledDate: today, limit: 50 }),
      orderService.listForStaff(req.user.id, { from: today, activeOnly: true, limit: 20 }),
    ]);
    res.json({
      today: todayJobs.data,
      upcoming: upcoming.data.filter((job) => job.scheduledDate !== today),
    });
  }),
);

router.get(
  '/jobs/:id',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await orderService.getOrderForActor(req.validatedParams.id, req.user));
  }),
);

/**
 * GET /api/staff/jobs/:id/access-secret
 * Entrega el codigo de acceso al domicilio. Queda auditado quien lo consulto.
 */
router.get(
  '/jobs/:id/access-secret',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await orderService.revealAccessSecret(req.validatedParams.id, req.user, req));
  }),
);

/** POST /api/staff/jobs/:id/accept — confirmar la asignacion recibida. */
router.post(
  '/jobs/:id/accept',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    const order = await assignmentService.acceptAssignment({
      orderId: req.validatedParams.id,
      actor: req.user,
      request: req,
    });
    res.json({ order: orderService.summarize(order, { hideMoney: true }) });
  }),
);

router.post(
  '/jobs/:id/decline',
  validate({
    params: schemas.idParamSchema,
    body: z.object({ reason: z.string().trim().max(500).optional() }),
  }),
  asyncHandler(async (req, res) => {
    res.json(
      await assignmentService.declineAssignment({
        orderId: req.validatedParams.id,
        actor: req.user,
        reason: req.body.reason,
        request: req,
      }),
    );
  }),
);

/**
 * POST /api/staff/jobs/:id/status
 * Unico camino para avanzar el trabajo: en camino, llegue, empece, termine.
 * La maquina de estados valida que el movimiento sea legal para este rol.
 */
router.post(
  '/jobs/:id/status',
  validate({ params: schemas.idParamSchema, body: schemas.transitionSchema }),
  asyncHandler(async (req, res) => {
    const order = await orderService.transitionStatus({
      orderId: req.validatedParams.id,
      toStatus: req.body.status,
      actor: req.user,
      note: req.body.note,
      request: req,
    });
    res.json({ order: orderService.summarize(order, { hideMoney: true }) });
  }),
);

router.post(
  '/jobs/:id/incidents',
  validate({ params: schemas.idParamSchema, body: schemas.incidentSchema }),
  asyncHandler(async (req, res) => {
    const result = await incidentService.report({
      orderId: req.validatedParams.id,
      actor: req.user,
      payload: req.body,
      request: req,
    });
    res.status(201).json(result);
  }),
);

// --- Bolsas de lavanderia --------------------------------------------------

router.get(
  '/jobs/:id/bags',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    await orderService.getOrderForActor(req.validatedParams.id, req.user);
    res.json({ bags: await laundryBagService.listForOrder(req.validatedParams.id) });
  }),
);

router.post(
  '/jobs/:id/bags',
  validate({
    params: schemas.idParamSchema,
    body: z.object({ bags: z.array(schemas.bagSchema).min(1).max(50) }),
  }),
  asyncHandler(async (req, res) => {
    const bags = await laundryBagService.registerBags({
      orderId: req.validatedParams.id,
      actor: req.user,
      bags: req.body.bags,
      request: req,
    });
    res.status(201).json({ bags });
  }),
);

router.patch(
  '/bags/:id',
  validate({ params: schemas.idParamSchema, body: schemas.bagStatusSchema }),
  asyncHandler(async (req, res) => {
    const bag = await laundryBagService.updateBagStatus({
      bagId: req.validatedParams.id,
      actor: req.user,
      payload: req.body,
      request: req,
    });
    res.json({ bag });
  }),
);

router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    res.json({ notifications: await notifications.listForUser(req.user.id) });
  }),
);

module.exports = router;
