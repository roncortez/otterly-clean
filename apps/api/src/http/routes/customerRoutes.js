'use strict';

const express = require('express');
const orderService = require('../../services/orderService');
const addressRepo = require('../../db/repositories/addressRepository');
const notifications = require('../../notifications');
const incidentService = require('../../services/incidentService');
const laundryBagService = require('../../services/laundryBagService');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/validate');
const { ROLES } = require('../../domain/shared/roles');
const { NotFoundError } = require('../../domain/errors');
const schemas = require('../schemas');

const router = express.Router();

// Todo lo de aqui exige sesion de cliente.
router.use(authenticate, requireRole(ROLES.CUSTOMER));

// ---------------------------------------------------------------------------
// Direcciones
// ---------------------------------------------------------------------------

router.get(
  '/addresses',
  asyncHandler(async (req, res) => {
    res.json({ addresses: await addressRepo.listByUser(req.user.id) });
  }),
);

router.post(
  '/addresses',
  validate({ body: schemas.addressSchema }),
  asyncHandler(async (req, res) => {
    const address = await addressRepo.create({
      ...req.body,
      userId: req.user.id,
      regionCode: req.body.regionCode ?? req.user.region_code,
      streetLine2: req.body.streetLine2 ?? null,
      neighborhood: req.body.neighborhood ?? null,
      administrativeArea: req.body.administrativeArea ?? null,
      postalCode: req.body.postalCode ?? null,
      reference: req.body.reference ?? null,
      latitude: req.body.latitude ?? null,
      longitude: req.body.longitude ?? null,
      zoneId: req.body.zoneId ?? null,
    });
    res.status(201).json({ address });
  }),
);

router.patch(
  '/addresses/:id',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    const fields = {};
    const map = {
      label: 'label',
      streetLine1: 'street_line1',
      streetLine2: 'street_line2',
      neighborhood: 'neighborhood',
      city: 'city',
      administrativeArea: 'administrative_area',
      postalCode: 'postal_code',
      reference: 'reference',
      latitude: 'latitude',
      longitude: 'longitude',
      zoneId: 'zone_id',
      isDefault: 'is_default',
    };
    for (const [key, column] of Object.entries(map)) {
      if (req.body[key] !== undefined) fields[column] = req.body[key];
    }

    const address = await addressRepo.update(req.validatedParams.id, req.user.id, fields);
    if (!address) throw new NotFoundError('Direccion', req.validatedParams.id);
    res.json({ address });
  }),
);

router.delete(
  '/addresses/:id',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    const archived = await addressRepo.archive(req.validatedParams.id, req.user.id);
    if (!archived) throw new NotFoundError('Direccion', req.validatedParams.id);
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------------------
// Cotizacion
// ---------------------------------------------------------------------------

/** POST /api/customer/quote — precio estimado antes de confirmar la reserva. */
router.post(
  '/quote',
  validate({ body: schemas.quoteSchema }),
  asyncHandler(async (req, res) => {
    const pricing = await orderService.quote({
      planId: req.body.planId,
      regionCode: req.user.region_code,
      pricingInput: req.body.pricingInput,
      extraCodes: req.body.extraCodes,
    });
    res.json({ pricing });
  }),
);

// ---------------------------------------------------------------------------
// Ordenes
// ---------------------------------------------------------------------------

router.post(
  '/orders/cleaning',
  validate({ body: schemas.createCleaningOrderSchema }),
  asyncHandler(async (req, res) => {
    const order = await orderService.createOrder({
      serviceType: 'CLEANING',
      customer: req.user,
      payload: req.body,
      request: req,
    });
    res.status(201).json({ order: orderService.summarize(order) });
  }),
);

router.post(
  '/orders/laundry',
  validate({ body: schemas.createLaundryOrderSchema }),
  asyncHandler(async (req, res) => {
    const order = await orderService.createOrder({
      serviceType: 'LAUNDRY',
      customer: req.user,
      payload: req.body,
      request: req,
    });
    res.status(201).json({ order: orderService.summarize(order) });
  }),
);

router.get(
  '/orders',
  validate({ query: schemas.orderQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await orderService.listForCustomer(req.user.id, req.validatedQuery));
  }),
);

router.get(
  '/orders/:id',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await orderService.getOrderForActor(req.validatedParams.id, req.user));
  }),
);

/** Bolsas de la orden: el cliente puede seguir su ropa pieza por pieza. */
router.get(
  '/orders/:id/bags',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    // getOrderForActor valida la propiedad de la orden y lanza 404 si no es suya.
    await orderService.getOrderForActor(req.validatedParams.id, req.user);
    res.json({ bags: await laundryBagService.listForOrder(req.validatedParams.id) });
  }),
);

router.post(
  '/orders/:id/cancel',
  validate({ params: schemas.idParamSchema, body: schemas.cancelSchema }),
  asyncHandler(async (req, res) => {
    const result = await orderService.cancelOrder({
      orderId: req.validatedParams.id,
      actor: req.user,
      reason: req.body.reason,
      request: req,
    });
    res.json(result);
  }),
);

router.post(
  '/orders/:id/incidents',
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

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------

router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    res.json({
      notifications: await notifications.listForUser(req.user.id, {
        unreadOnly: req.query.unread === 'true',
      }),
    });
  }),
);

router.post(
  '/notifications/:id/read',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    await notifications.markRead(req.user.id, req.validatedParams.id);
    res.status(204).send();
  }),
);

module.exports = router;
