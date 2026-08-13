'use strict';

const express = require('express');
const catalogRepo = require('../../db/repositories/catalogRepository');
const serviceCatalog = require('../../services/serviceCatalogService');
const availabilityService = require('../../services/availabilityService');
const companyService = require('../../services/companyService');
const settingsService = require('../../services/settingsService');
const addressService = require('../../services/addressService');
const { getRegion, listRegions } = require('../../config/regions');
const { optionalAuth } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/validate');
const schemas = require('../schemas');
const env = require('../../config/env');

const router = express.Router();

/**
 * Catalogo publico.
 *
 * Es el contrato que permite que el frontend no escriba a mano ni "Provincia",
 * ni "$", ni el telefono de la empresa, ni el nombre de un servicio. Todo lo
 * que aqui se sirve es informacion que ya es publica por definicion: nada de
 * secretos, credenciales ni configuracion tecnica.
 */

/** Region efectiva: la del usuario autenticado, la pedida, o la de por defecto. */
function resolveRegionCode(req) {
  return (req.query.region ?? req.user?.region_code ?? env.defaultRegion).toUpperCase();
}

/**
 * GET /api/catalog/config
 * Todo lo que el frontend necesita para arrancar: configuracion regional,
 * datos publicos de la empresa y estado de los tipos de servicio. Una sola
 * peticion, porque son datos que se necesitan a la vez en el primer render.
 */
router.get(
  '/config',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const region = getRegion(resolveRegionCode(req));
    const [company, services, mapHints] = await Promise.all([
      companyService.getPublic(),
      serviceCatalog.listAll(),
      addressService.mapHints(region.code),
    ]);

    res.json({
      /**
       * Orientacion del buscador de direcciones.
       *
       * Sale de las zonas de cobertura activas, no de una constante escrita a
       * mano: abrir una ciudad nueva es darle cobertura a su zona desde
       * Operaciones, sin tocar codigo. `regionCode` va en minusculas porque es
       * el formato ISO 3166-1 alfa-2 que esperan los geocodificadores para
       * filtrar por pais.
       *
       * Es una preferencia, no una carcel: sesga los resultados hacia donde
       * trabajamos, y quien decide si atendemos un punto es el backend.
       */
      maps: {
        regionCode: region.code.toLowerCase(),
        bias: mapHints,
      },
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
      company,
      availableRegions: listRegions().map((r) => ({ code: r.code, name: r.name })),
      // `implemented` lo decide el codigo; `active`, Operaciones. Se exponen
      // los dos para que la interfaz pueda explicar por que algo no aparece.
      serviceTypes: services.map((service) => ({
        code: service.code,
        label: service.label,
        description: service.description,
        customerInfo: service.customerInfo,
        icon: service.icon,
        imageUrl: service.imageUrl,
        displayOrder: service.displayOrder,
        addressModel: service.addressModel,
        implemented: service.implemented,
        active: service.active,
        bookable: service.bookable,
      })),
    });
  }),
);

/** GET /api/catalog/company — datos publicos de contacto y marca. */
router.get(
  '/company',
  asyncHandler(async (_req, res) => {
    res.json({ company: await companyService.getPublic() });
  }),
);

/** GET /api/catalog/services — servicios que se pueden reservar hoy. */
router.get(
  '/services',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const regionCode = resolveRegionCode(req);
    res.json({ regionCode, services: await serviceCatalog.listBookable(regionCode) });
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

/**
 * GET /api/catalog/availability
 * Dias y franjas reservables. El asistente de reserva lo usa para no ofrecer
 * horarios que el backend va a rechazar; la decision real se sigue tomando al
 * crear la orden.
 */
router.get(
  '/availability',
  optionalAuth,
  validate({ query: schemas.availabilityQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await availabilityService.getCalendar({
        regionCode: resolveRegionCode(req),
        serviceType: req.validatedQuery.serviceType,
        from: req.validatedQuery.from,
        to: req.validatedQuery.to,
      }),
    );
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

/** GET /api/catalog/banner — banner promocional publico. */
router.get(
  '/banner',
  asyncHandler(async (_req, res) => {
    res.json(await settingsService.getBanner());
  }),
);

module.exports = router;
