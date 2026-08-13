'use strict';

const { db } = require('../db');
const propertyRepo = require('../db/repositories/propertyRepository');
const addressRepo = require('../db/repositories/addressRepository');
const addressService = require('./addressService');
const { encrypt } = require('./crypto');
const { NotFoundError, DomainError } = require('../domain/errors');

/**
 * Lugares de limpieza del cliente.
 *
 * El lugar vive en una direccion y esa direccion es la fuente de verdad: este
 * servicio nunca copia el texto de la calle dentro del lugar. Al crear se recibe
 * un `addressId` (direccion ya guardada) o un `address` (se crea la direccion al
 * vuelo reutilizando addressService, con su comprobacion de cobertura). El
 * codigo de acceso se cifra antes de tocar la base.
 *
 * EL PREDETERMINADO. Misma regla que en direcciones y por el mismo motivo: "el
 * lugar del cliente" tiene que ser una respuesta y no un ORDER BY. Como mucho
 * uno lo garantiza un indice unico parcial (migracion 012); al menos uno lo
 * mantiene este servicio, porque depende de cuantos quedan:
 *
 *   crear el primero      -> queda marcado, lo pida o no
 *   marcar otro           -> el anterior se desmarca solo
 *   desmarcar el marcado  -> se rechaza; se cambia marcando otro
 *   borrar el marcado     -> asciende otro en la misma transaccion
 */

const PROPERTY_COLUMN_MAP = {
  name: 'name',
  propertyType: 'property_type',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  areaValue: 'area_value',
  areaUnit: 'area_unit',
  accessCode: 'access_code',
  notes: 'notes',
  accessMethod: 'access_method',
  accessInstructions: 'access_instructions',
  parkingInstructions: 'parking_instructions',
  customerPresent: 'customer_present',
  hasPets: 'has_pets',
  pets: 'pets',
  petsSecured: 'pets_secured',
  petInstructions: 'pet_instructions',
  delicateItems: 'delicate_items',
  isDefault: 'is_default',
};

/**
 * Proyeccion publica de un lugar.
 *
 * `accessCode` sale siempre a null y aparte va `hasAccessCode`: lo que viaja es
 * si hay un codigo guardado, no cual es. Ver docs/SECURITY.md.
 */
function projectProperty(prop) {
  return {
    id: prop.id,
    name: prop.name,
    propertyType: prop.property_type,
    bedrooms: prop.bedrooms,
    bathrooms: prop.bathrooms,
    areaValue: prop.area_value === null || prop.area_value === undefined
      ? null
      : Number(prop.area_value),
    areaUnit: prop.area_unit,
    accessCode: null,
    hasAccessCode: prop.access_code ? true : false,
    notes: prop.notes,
    accessMethod: prop.access_method,
    accessInstructions: prop.access_instructions,
    parkingInstructions: prop.parking_instructions,
    customerPresent: prop.customer_present,
    hasPets: prop.has_pets,
    pets: prop.pets,
    petsSecured: prop.pets_secured,
    petInstructions: prop.pet_instructions,
    delicateItems: prop.delicate_items,
    isDefault: Boolean(prop.is_default),
    addressId: prop.address_id,
    createdAt: prop.created_at,
  };
}

async function createProperty(user, data) {
  return db.tx(async (tx) => {
    // La direccion puede venir ya guardada o crearse aqui mismo. En ambos casos
    // acaba siendo del usuario, nunca de otra persona.
    let addressId;
    if (data.addressId) {
      const address = await addressRepo.findByIdForUser(data.addressId, user.id, tx);
      if (!address) throw new NotFoundError('Direccion', data.addressId);
      addressId = data.addressId;
    } else if (data.address) {
      const result = await addressService.create({ user, payload: data.address });
      addressId = result.address.id;
    } else {
      throw new DomainError(
        'MISSING_ADDRESS',
        'El lugar necesita una dirección guardada o una dirección nueva.',
      );
    }

    // El primero es el predeterminado aunque no lo pida: un cliente con un solo
    // lugar y ninguno marcado obligaria a cada pantalla a desempatar sola.
    const isFirst = (await propertyRepo.countByUser(user.id, tx)) === 0;

    const prop = await propertyRepo.createProperty(
      user.id,
      {
        ...data,
        addressId,
        accessCode: data.accessCode ? encrypt(data.accessCode) : null,
        isDefault: isFirst || (data.isDefault ?? false),
      },
      tx,
    );

    return projectProperty(prop);
  });
}

/**
 * Actualizacion parcial del lugar propio. Solo se aplican los campos que vienen
 * en el payload (PATCH); la direccion no se cambia aqui, porque el lugar vive en
 * una direccion y eso es fuente de verdad aparte.
 */
async function updateProperty(user, propertyId, payload) {
  return db.tx(async (tx) => {
    const current = await propertyRepo.findPropertyById(propertyId, user.id, tx);
    if (!current) throw new NotFoundError('Lugar', propertyId);

    const fields = {};
    for (const [key, column] of Object.entries(PROPERTY_COLUMN_MAP)) {
      if (payload[key] !== undefined) fields[column] = payload[key];
    }
    if (fields.access_code !== undefined) {
      fields.access_code = fields.access_code ? encrypt(fields.access_code) : null;
    }

    // Desmarcar no es una operacion: se cambia marcando otro. Aceptarlo y
    // arreglarlo por detras dejaria la pantalla mostrando algo distinto de lo
    // que se guardo.
    if (fields.is_default === false && current.is_default) {
      throw new DomainError(
        'DEFAULT_PLACE_REQUIRED',
        (await propertyRepo.countByUser(user.id, tx)) <= 1
          ? 'Es tu único lugar, así que tiene que seguir siendo el predeterminado.'
          : 'Siempre hay un lugar predeterminado. Marca otro como predeterminado para cambiarlo.',
        { propertyId },
      );
    }

    const updated = await propertyRepo.updateProperty(propertyId, user.id, fields, tx);
    return projectProperty(updated);
  });
}

async function listProperties(userId) {
  const props = await propertyRepo.listUserProperties(userId);
  return props.map((p) => ({
    ...projectProperty(p),
    address: p.addr_id
      ? {
          id: p.addr_id,
          label: p.addr_label,
          streetLine1: p.addr_street_line1,
          streetLine2: p.addr_street_line2,
          neighborhood: p.addr_neighborhood,
          city: p.addr_city,
          administrativeArea: p.addr_administrative_area,
          reference: p.addr_reference,
          latitude: p.addr_latitude,
          longitude: p.addr_longitude,
          zoneId: p.addr_zone_id,
          isDefault: p.addr_is_default,
        }
      : null,
  }));
}

/**
 * Borra un lugar y deja el resto en un estado valido.
 *
 * Si el borrado se lleva el predeterminado, otro toma el relevo en la misma
 * transaccion. Si era el ultimo no hay a quien ascender y no queda ninguno: eso
 * si es correcto.
 */
async function deleteProperty(id, userId) {
  return db.tx(async (tx) => {
    const deleted = await propertyRepo.deleteProperty(id, userId, tx);
    if (!deleted) throw new NotFoundError('Lugar', id);

    await propertyRepo.ensureDefault(userId, tx);
    return deleted;
  });
}

module.exports = {
  createProperty,
  updateProperty,
  listProperties,
  deleteProperty,
  projectProperty,
};
