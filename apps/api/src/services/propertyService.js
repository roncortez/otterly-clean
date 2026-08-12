'use strict';

const propertyRepo = require('../db/repositories/propertyRepository');
const { encrypt, decrypt } = require('./crypto');
const { NotFoundError } = require('../domain/errors');

async function createProperty(userId, data) {
  const encryptedAccessCode = data.accessCode ? encrypt(data.accessCode) : null;
  const prop = await propertyRepo.createProperty(userId, {
    ...data,
    accessCode: encryptedAccessCode,
  });

  return {
    ...prop,
    accessCode: data.accessCode || null,
  };
}

async function listProperties(userId) {
  const props = await propertyRepo.listUserProperties(userId);
  return props.map((p) => ({
    ...p,
    accessCode: p.access_code ? decrypt(p.access_code) : null,
  }));
}

async function deleteProperty(id, userId) {
  const deleted = await propertyRepo.deleteProperty(id, userId);
  if (!deleted) throw new NotFoundError('Inmueble no encontrado');
  return deleted;
}

module.exports = {
  createProperty,
  listProperties,
  deleteProperty,
};
