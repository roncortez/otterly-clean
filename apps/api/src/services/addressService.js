'use strict';

const { db } = require('../db');
const addressRepo = require('../db/repositories/addressRepository');
const catalogRepo = require('../db/repositories/catalogRepository');
const { encrypt } = require('./crypto');
const { locateZone, coverageEnvelope, isValidPoint } = require('../domain/shared/serviceArea');
const { NotFoundError, DomainError } = require('../domain/errors');

/**
 * Direcciones del cliente.
 *
 * Una direccion tiene dos mitades que no se sustituyen:
 *
 *   * **La coordenada** dice donde esta la casa. La elige el cliente en el mapa
 *     y es la referencia para llegar.
 *   * **El texto** dice como se describe: urbanizacion, conjunto, numero de
 *     casa, "junto al parque". Ningun geocodificador acierta con eso en Quito,
 *     asi que lo escribe el cliente y la aplicacion no lo pisa.
 *
 * Por eso se puede corregir el texto sin mover el punto, y mover el punto sin
 * perder el texto. Y por eso la direccion sigue sirviendo aunque el proveedor
 * de geocodificacion no responda: el texto es dato propio, no una copia de su
 * respuesta.
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
  providerPlaceId: 'provider_place_id',
  geocodingProvider: 'geocoding_provider',
  isDefault: 'is_default',
});

/**
 * El identificador del lugar y quien lo emitio son un solo dato en dos
 * columnas: un place_id sin proveedor no se puede interpretar (el de Google no
 * significa nada en Geoapify) y un proveedor sin place_id no dice nada. Se
 * normalizan juntos para que la base no pueda quedar a medias.
 */
function normalizePlaceReference({ providerPlaceId, geocodingProvider }) {
  const placeId = providerPlaceId ?? null;
  return {
    providerPlaceId: placeId,
    geocodingProvider: placeId ? (geocodingProvider ?? null) : null,
  };
}

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

/**
 * Datos del hogar que ve el cliente.
 *
 * Se construye campo a campo en lugar de reenviar la fila: `access_secret_encrypted`
 * no puede salir de aqui ni por descuido, igual que en el detalle de una orden.
 * Lo que viaja es si hay algo guardado, no que es.
 */
function projectCleaningProfile(profile) {
  if (!profile) return null;
  return {
    propertyType: profile.property_type,
    bedrooms: profile.bedrooms,
    bathrooms: profile.bathrooms,
    areaValue: profile.area_value === null ? null : Number(profile.area_value),
    areaUnit: profile.area_unit,
    hasPets: profile.has_pets,
    pets: profile.pets ?? [],
    petInstructions: profile.pet_instructions,
    accessMethod: profile.access_method,
    accessInstructions: profile.access_instructions,
    parkingInstructions: profile.parking_instructions,
    notes: profile.notes,
    hasAccessSecret: Boolean(profile.access_secret_encrypted),
    updatedAt: profile.updated_at,
  };
}

/**
 * Direcciones del cliente con los datos de hogar que tenga cada una.
 *
 * Van juntos en una sola respuesta porque juntos se usan: el asistente de
 * limpieza necesita saber, al elegir la direccion, que ya sabemos de esa casa
 * para no volver a preguntarlo.
 */
async function list(userId, tx = db) {
  const [addresses, profiles] = await Promise.all([
    addressRepo.listByUser(userId, tx),
    addressRepo.listCleaningProfilesByUser(userId, tx),
  ]);

  const byAddress = new Map(profiles.map((profile) => [String(profile.address_id), profile]));

  return addresses.map((address) => ({
    ...address,
    cleaningProfile: projectCleaningProfile(byAddress.get(String(address.id))),
  }));
}

/**
 * Guarda los datos del hogar de una direccion propia.
 *
 * El codigo de acceso se cifra aqui, igual que al reservar, y solo se toca si
 * viene en la peticion: guardar el resto de la ficha no puede borrar en
 * silencio la clave de la puerta. Enviar cadena vacia si lo retira, que es una
 * intencion distinta de no mencionarlo.
 */
async function saveCleaningProfile({ user, addressId, payload }) {
  const address = await addressRepo.findByIdForUser(addressId, user.id);
  if (!address) throw new NotFoundError('Direccion', addressId);

  const fields = {
    property_type: payload.propertyType,
    bedrooms: payload.bedrooms,
    bathrooms: payload.bathrooms,
    area_value: payload.areaValue,
    area_unit: payload.areaUnit,
    has_pets: payload.hasPets,
    pets: payload.pets,
    pet_instructions: payload.petInstructions,
    access_method: payload.accessMethod,
    access_instructions: payload.accessInstructions,
    parking_instructions: payload.parkingInstructions,
    notes: payload.notes,
  };

  if (payload.accessSecret !== undefined) {
    fields.access_secret_encrypted = payload.accessSecret ? encrypt(payload.accessSecret) : null;
  }

  const profile = await addressRepo.upsertCleaningProfile(addressId, fields);
  return { cleaningProfile: projectCleaningProfile(profile) };
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
    ...normalizePlaceReference(payload),
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

  // El identificador del lugar y su proveedor se escriben siempre juntos,
  // aunque el PATCH traiga solo uno: dejar el proveedor apuntando a un
  // identificador que se acaba de borrar guardaria una atribucion falsa.
  if (payload.providerPlaceId !== undefined || payload.geocodingProvider !== undefined) {
    const pair = normalizePlaceReference({
      providerPlaceId:
        payload.providerPlaceId !== undefined ? payload.providerPlaceId : current.provider_place_id,
      geocodingProvider:
        payload.geocodingProvider !== undefined
          ? payload.geocodingProvider
          : current.geocoding_provider,
    });
    fields.provider_place_id = pair.providerPlaceId;
    fields.geocoding_provider = pair.geocodingProvider;
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
  projectCleaningProfile,
  saveCleaningProfile,
};
