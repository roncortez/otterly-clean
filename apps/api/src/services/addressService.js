'use strict';

const { db } = require('../db');
const addressRepo = require('../db/repositories/addressRepository');
const catalogRepo = require('../db/repositories/catalogRepository');
const { locateZone, coverageEnvelope, isValidPoint } = require('../domain/shared/serviceArea');
const { NotFoundError, DomainError } = require('../domain/errors');
const { decrypt } = require('./crypto');

/**
 * Direcciones del cliente.
 *
 * Una direccion tiene dos mitades que no se sustituyen:
 *
 *   * **La coordenada** dice donde esta la casa. La elige el cliente en el mapa
 *     y es la referencia para llegar.
 *   * **El texto** dice como se describe: urbanizacion, conjunto, numero de
 *     casa, "junto al parque". Google no acierta con eso en Quito, asi que lo
 *     escribe el cliente y la aplicacion no lo pisa.
 *
 * Por eso se puede corregir el texto sin mover el punto, y mover el punto sin
 * perder el texto. Y por eso la direccion sigue sirviendo aunque Google no
 * responda: el texto es dato propio, no una copia de su respuesta.
 */

/** Nombres de columna de las actualizaciones parciales. Lista blanca. */
const COLUMN_MAP = Object.freeze({
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
  googlePlaceId: 'google_place_id',
  isDefault: 'is_default',
});

/** Error de negocio propio: la ubicacion existe, pero no la atendemos. */
class OutOfServiceAreaError extends DomainError {
  constructor(details = {}) {
    super(
      'OUT_OF_SERVICE_AREA',
      'Todavía no llegamos a esa ubicación. Escríbenos y te avisamos cuando abramos tu zona.',
      details,
    );
    this.name = 'OutOfServiceAreaError';
  }
}

/**
 * Zona que corresponde a un punto.
 *
 * La comprobacion es del servidor, no del navegador: el frontend puede avisar
 * antes para dar buena experiencia, pero quien decide es esto.
 */
async function resolveServiceArea({ latitude, longitude, regionCode }, tx = db) {
  const zones = await catalogRepo.listZones({ regionCode }, tx);
  const result = locateZone({ latitude, longitude }, zones);

  return {
    checked: result.checked,
    covered: result.covered,
    zoneId: result.zone?.id ?? null,
    zoneName: result.zone?.name ?? null,
  };
}

/**
 * Lo que la interfaz necesita para orientar el buscador del mapa.
 *
 * Sale de las zonas activas, no de una constante: abrir una ciudad nueva es
 * darle cobertura a su zona, sin tocar codigo ni desplegar.
 */
async function mapHints(regionCode, tx = db) {
  const zones = await catalogRepo.listZones({ regionCode }, tx);
  const envelope = coverageEnvelope(zones);
  if (!envelope) return null;

  return {
    center: { latitude: envelope.center.latitude, longitude: envelope.center.longitude },
    radiusMeters: Math.round(envelope.radiusKm * 1000),
  };
}

async function list(userId, tx = db) {
  const addresses = await addressRepo.listByUser(userId, tx);
  return addresses.map(
    ({
      property_id,
      property_name,
      property_type,
      property_bedrooms,
      property_bathrooms,
      property_access_code,
      property_notes,
      property_access_method,
      property_access_instructions,
      property_parking_instructions,
      property_customer_present,
      property_has_pets,
      property_pets,
      property_pets_secured,
      property_pet_instructions,
      property_delicate_items,
      ...address
    }) => ({
      ...address,
      // El inmueble que vive en esta direccion (si hay): permite a la reserva
      // pre-rellenar identidad y acceso con los datos ya guardados. El codigo
      // de acceso viaja descifrado, igual que en el listado de inmuebles.
      property: property_id
        ? {
            id: property_id,
            name: property_name,
            propertyType: property_type,
            bedrooms: property_bedrooms,
            bathrooms: property_bathrooms,
            accessCode: null,
            hasAccessCode: property_access_code ? true : false,
            notes: property_notes,
            accessMethod: property_access_method,
            accessInstructions: property_access_instructions,
            parkingInstructions: property_parking_instructions,
            customerPresent: property_customer_present,
            hasPets: property_has_pets,
            pets: property_pets,
            petsSecured: property_pets_secured,
            petInstructions: property_pet_instructions,
            delicateItems: property_delicate_items,
          }
        : null,
    }),
  );
}

/**
 * Crea una direccion.
 *
 * Guardar una ubicacion fuera de cobertura NO se bloquea: el cliente puede
 * registrar la casa de su madre antes de que abramos esa zona, y bloquear la
 * pantalla no le explicaria nada. Lo que si se impide es reservar sobre ella
 * (ver `assertServiceable`, que usa orderService). La respuesta lleva el estado
 * de cobertura para poder decirlo con claridad en el momento.
 */
async function create({ user, payload, request: _request }) {
  const regionCode = payload.regionCode ?? user.region_code;
  const point = { latitude: payload.latitude ?? null, longitude: payload.longitude ?? null };

  const area = isValidPoint(point)
    ? await resolveServiceArea({ ...point, regionCode })
    : { checked: false, covered: true, zoneId: null, zoneName: null };

  const address = await addressRepo.create({
    userId: user.id,
    label: payload.label,
    regionCode,
    streetLine1: payload.streetLine1,
    streetLine2: payload.streetLine2 ?? null,
    neighborhood: payload.neighborhood ?? null,
    city: payload.city,
    administrativeArea: payload.administrativeArea ?? null,
    postalCode: payload.postalCode ?? null,
    reference: payload.reference ?? null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    googlePlaceId: payload.googlePlaceId ?? null,
    // La zona la decide la coordenada cuando existe; el desplegable solo manda
    // mientras no haya punto en el mapa.
    zoneId: area.zoneId ?? payload.zoneId ?? null,
    isDefault: payload.isDefault ?? false,
  });

  return { address, serviceArea: area };
}

/**
 * Actualiza una direccion propia.
 *
 * Se puede cambiar solo el texto (sin tocar coordenadas) o solo el punto: cada
 * campo enviado se aplica y los ausentes se quedan como estaban. La zona solo
 * se recalcula si vienen coordenadas nuevas.
 */
async function update({ user, addressId, payload }) {
  const current = await addressRepo.findByIdForUser(addressId, user.id);
  // 404 y no 403: confirmar que existe la direccion de otra persona ya seria
  // decir demasiado.
  if (!current) throw new NotFoundError('Direccion', addressId);

  const fields = {};
  for (const [key, column] of Object.entries(COLUMN_MAP)) {
    if (payload[key] !== undefined) fields[column] = payload[key];
  }

  const movesPin = payload.latitude !== undefined || payload.longitude !== undefined;
  let area = null;

  if (movesPin) {
    const point = {
      latitude: payload.latitude ?? current.latitude,
      longitude: payload.longitude ?? current.longitude,
    };
    if (isValidPoint(point)) {
      area = await resolveServiceArea({ ...point, regionCode: current.region_code });
      fields.zone_id = area.zoneId;
    } else {
      // Quitar el punto deja la direccion sin zona derivada: es texto otra vez.
      fields.zone_id = null;
    }
  } else if (payload.zoneId !== undefined) {
    fields.zone_id = payload.zoneId;
  }

  const address = await addressRepo.update(addressId, user.id, fields);
  if (!address) throw new NotFoundError('Direccion', addressId);

  return { address, serviceArea: area };
}

async function archive({ user, addressId }) {
  const archived = await addressRepo.archive(addressId, user.id);
  if (!archived) throw new NotFoundError('Direccion', addressId);
  return archived;
}

/**
 * Puerta de entrada a la reserva: ¿podemos atender en esta direccion?
 *
 * Solo rechaza cuando hay motivo real: la direccion tiene coordenadas, la
 * region tiene cobertura configurada y el punto no cae en ninguna zona. Una
 * direccion antigua sin coordenadas sigue funcionando como siempre.
 */
async function assertServiceable(address, tx = db) {
  if (!isValidPoint({ latitude: address.latitude, longitude: address.longitude })) return null;

  const area = await resolveServiceArea(
    {
      latitude: address.latitude,
      longitude: address.longitude,
      regionCode: address.region_code,
    },
    tx,
  );

  if (area.checked && !area.covered) {
    throw new OutOfServiceAreaError({ addressId: address.id });
  }

  return area;
}

module.exports = {
  OutOfServiceAreaError,
  resolveServiceArea,
  mapHints,
  list,
  create,
  update,
  archive,
  assertServiceable,
};
