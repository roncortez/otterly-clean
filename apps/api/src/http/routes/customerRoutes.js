'use strict';

const express = require('express');
const orderService = require('../../services/orderService');
const addressService = require('../../services/addressService');
const notifications = require('../../notifications');
const incidentService = require('../../services/incidentService');
const laundryBagService = require('../../services/laundryBagService');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/validate');
const { ROLES } = require('../../domain/shared/roles');
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
    res.json({ addresses: await addressService.list(req.user.id) });
  }),
);

/**
 * POST /api/customer/addresses
 *
 * Guarda la ubicacion del mapa y el texto que escribe el cliente. La respuesta
 * incluye `serviceArea` para poder decirle en el momento si esa ubicacion cae
 * en una zona que atendemos; guardarla no se bloquea, reservar sobre ella si.
 */
router.post(
  '/addresses',
  validate({ body: schemas.addressSchema }),
  asyncHandler(async (req, res) => {
    const result = await addressService.create({ user: req.user, payload: req.body, request: req });
    res.status(201).json(result);
  }),
);

router.patch(
  '/addresses/:id',
  validate({ params: schemas.idParamSchema, body: schemas.updateAddressSchema }),
  asyncHandler(async (req, res) => {
    const result = await addressService.update({
      user: req.user,
      addressId: req.validatedParams.id,
      payload: req.body,
    });
    res.json(result);
  }),
);

router.delete(
  '/addresses/:id',
  validate({ params: schemas.idParamSchema }),
  asyncHandler(async (req, res) => {
    await addressService.archive({ user: req.user, addressId: req.validatedParams.id });
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

// ---------------------------------------------------------------------------
// Propiedades e Inmuebles
// ---------------------------------------------------------------------------

const propertyService = require('../../services/propertyService');
const couponService = require('../../services/couponService');

router.get(
  '/properties',
  asyncHandler(async (req, res) => {
    res.json({ properties: await propertyService.listProperties(req.user.id) });
  }),
);

router.post(
  '/properties',
  asyncHandler(async (req, res) => {
    const property = await propertyService.createProperty(req.user.id, req.body);
    res.status(201).json({ property });
  }),
);

router.delete(
  '/properties/:id',
  asyncHandler(async (req, res) => {
    await propertyService.deleteProperty(Number(req.params.id), req.user.id);
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------------------
// Cupones (Validacion por el cliente)
// ---------------------------------------------------------------------------

router.post(
  '/coupons/validate',
  asyncHandler(async (req, res) => {
    const { code, amount } = req.body;
    const result = await couponService.validateCoupon(code, req.user.id, Number(amount || 0));
    res.json(result);
  }),
);

module.exports = router;
