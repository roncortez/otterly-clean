'use strict';

const express = require('express');
const catalogRepo = require('../../db/repositories/catalogRepository');
const { getRegion, listRegions } = require('../../config/regions');
const { enabledServiceTypes, SERVICE_DEFINITIONS } = require('../../domain/shared/serviceTypes');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/validate');
const env = require('../../config/env');

const router = express.Router();

/** Region efectiva: la del usuario autenticado, la pedida, o la de por defecto. */
function resolveRegionCode(req) {
  return (req.query.region ?? req.user?.region_code ?? env.defaultRegion).toUpperCase();
}

/**
 * GET /api/catalog/config
 * Toda la configuracion regional que el frontend necesita para renderizar
 * formularios: moneda, impuesto, campos de direccion, ventanas horarias.
 * Es lo que evita hardcodear "Provincia" o "$" en el cliente.
 */
router.get(
  '/config',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const region = getRegion(resolveRegionCode(req));
    res.json({
      region: {
        code: region.code,
        name: region.name,
        locale: region.locale,
        timezone: region.timezone,
        currency: region.currency,
        tax: { code: region.tax.code, label: region.tax.label, rate: region.tax.rate },
        phone: region.phone,
        address: region.address,
        units: region.units,
        taxIdTypes: region.taxIdTypes,
        booking: region.booking,
      },
      availableRegions: listRegions().map((r) => ({ code: r.code, name: r.name })),
      serviceTypes: Object.values(SERVICE_DEFINITIONS).map((s) => ({
        code: s.code,
        label: s.label,
        description: s.description,
        enabled: s.enabled,
        addressModel: s.addressModel,
      })),
    });
  }),
);

/** GET /api/catalog/services — tipos de servicio ofrecidos hoy. */
router.get(
  '/services',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const regionCode = resolveRegionCode(req);
    const services = await Promise.all(
      enabledServiceTypes().map(async (service) => ({
        code: service.code,
        label: service.label,
        description: service.description,
        addressModel: service.addressModel,
        plans: await catalogRepo.listPlans({ serviceType: service.code, regionCode }),
        extras: await catalogRepo.listExtras({ serviceType: service.code, regionCode }),
      })),
    );
    res.json({ regionCode, services });
  }),
);

/** GET /api/catalog/services/:serviceType/plans */
router.get(
  '/services/:serviceType/plans',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const regionCode = resolveRegionCode(req);
    const serviceType = req.params.serviceType.toUpperCase();
    const [plans, extras] = await Promise.all([
      catalogRepo.listPlans({ serviceType, regionCode }),
      catalogRepo.listExtras({ serviceType, regionCode }),
    ]);
    res.json({ serviceType, regionCode, plans, extras });
  }),
);

/** GET /api/catalog/zones — zonas de cobertura activas. */
router.get(
  '/zones',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const zones = await catalogRepo.listZones({ regionCode: resolveRegionCode(req) });
    res.json({ zones });
  }),
);

/** GET /api/catalog/banner — public promotional banner */
const settingsService = require('../../services/settingsService');

router.get(
  '/banner',
  asyncHandler(async (req, res) => {
    res.json(await settingsService.getBanner());
  }),
);

module.exports = router;
