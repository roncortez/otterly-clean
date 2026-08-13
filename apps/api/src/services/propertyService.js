'use strict';

const propertyRepo = require('../db/repositories/propertyRepository');
const addressRepo = require('../db/repositories/addressRepository');
const addressService = require('./addressService');
const { encrypt, decrypt } = require('./crypto');
const { NotFoundError, DomainError } = require('../domain/errors');

/**
 * Inmuebles del cliente.
 *
 * El inmueble vive en una direccion y esa direccion es la fuente de verdad:
 * este servicio nunca copia el texto de la calle dentro del inmueble. Al crear
 * se recibe un `addressId` (direccion ya guardada) o un `address` (se crea la
 * direccion al vuelo reutilizando addressService, con su comprobacion de
 * cobertura). El codigo de acceso se cifra antes de tocar la base.
 */

const PROPERTY_COLUMN_MAP = {
  name: 'name',
  propertyType: 'property_type',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
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
};

/** Proyeccion publica de un inmueble (con el codigo de acceso descifrado). */
function projectProperty(prop) {
  return {
    id: prop.id,
    name: prop.name,
    propertyType: prop.property_type,
    bedrooms: prop.bedrooms,
    bathrooms: prop.bathrooms,
    accessCode: prop.access_code ? decrypt(prop.access_code) : null,
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
    addressId: prop.address_id,
    createdAt: prop.created_at,
  };
}

async function createProperty(user, data) {
  // La direccion puede venir ya guardada o crearse aqui mismo. En ambos casos
  // acaba siendo del usuario, nunca de otra persona.
  let addressId;
  if (data.addressId) {
    const address = await addressRepo.findByIdForUser(data.addressId, user.id);
    if (!address) throw new NotFoundError('Direccion', data.addressId);
    addressId = data.addressId;
  } else if (data.address) {
    const result = await addressService.create({ user, payload: data.address });
    addressId = result.address.id;
  } else {
    throw new DomainError(
      'MISSING_ADDRESS',
      'El inmueble necesita una dirección guardada o una dirección nueva.',
    );
  }

  const encryptedAccessCode = data.accessCode ? encrypt(data.accessCode) : null;
  const prop = await propertyRepo.createProperty(user.id, {
    ...data,
    addressId,
    accessCode: encryptedAccessCode,
  });

  return projectProperty(prop);
}

/**
 * Actualizacion parcial del inmueble propio. Solo se aplican los campos que
 * vienen en el payload (PATCH); la direccion de residencia no se cambia aqui,
 * porque el inmueble vive en una direccion y eso es fuente de verdad aparte.
 */
async function updateProperty(user, propertyId, payload) {
  const current = await propertyRepo.findPropertyById(propertyId, user.id);
  if (!current) throw new NotFoundError('Inmueble', propertyId);

  const fields = {};
  for (const [key, column] of Object.entries(PROPERTY_COLUMN_MAP)) {
    if (payload[key] !== undefined) fields[column] = payload[key];
  }
  if (fields.access_code !== undefined) {
    fields.access_code = fields.access_code ? encrypt(fields.access_code) : null;
  }

  const updated = await propertyRepo.updateProperty(propertyId, user.id, fields);
  return projectProperty(updated);
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

async function deleteProperty(id, userId) {
  const deleted = await propertyRepo.deleteProperty(id, userId);
  if (!deleted) throw new NotFoundError('Inmueble no encontrado');
  return deleted;
}

module.exports = {
  createProperty,
  updateProperty,
  listProperties,
  deleteProperty,
};
