'use strict';

/**
 * Inmuebles del cliente.
 *
 * La idea que se prueba aqui: un inmueble es el perfil de la residencia que
 * vive en una direccion. Se crea vinculado a una direccion ya guardada
 * (`addressId`) o creando la direccion al vuelo (`address`), y nunca copia el
 * texto de la calle: el listado lo devuelve unido a su direccion y el listado
 * de direcciones devuelve el inmueble para que la reserva pueda pre-rellenar
 * tipo, habitaciones y banos con datos ya guardados.
 */

const request = require('supertest');
const { createApp } = require('../src/http/app');
const { db, pgp } = require('../src/db');

const app = createApp();

const stamp = Date.now();
const auth = {};
const created = { userIds: [] };

const QUITO = { latitude: -0.1807, longitude: -78.4678 };

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, `login ${email}: ${JSON.stringify(res.body)}`).toBe(200);
  return res.body;
}

async function registerCustomer(suffix) {
  const res = await request(app).post('/api/auth/register').send({
    email: `test.inmuebles.${stamp}.${suffix}@ejemplo.com`,
    password: 'Cliente123!',
    firstName: 'Cliente',
    lastName: 'Inmuebles',
    phone: '+593991234511',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  created.userIds.push(res.body.user.id);
  return res.body;
}

function newAddress(overrides = {}) {
  return {
    label: 'Casa',
    streetLine1: 'Av. Amazonas N34-120',
    streetLine2: 'Edificio Torre Azul, departamento 5B',
    neighborhood: 'La Carolina',
    city: 'Quito',
    administrativeArea: 'Pichincha',
    reference: 'Junto a la embajada, portón gris',
    ...QUITO,
    ...overrides,
  };
}

async function createAddress(token, overrides) {
  return request(app)
    .post('/api/customer/addresses')
    .set('Authorization', `Bearer ${token}`)
    .send(newAddress(overrides));
}

async function createProperty(token, payload) {
  return request(app)
    .post('/api/customer/properties')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

beforeAll(async () => {
  auth.admin = (await login('admin@otterlyclean.ec', 'Admin123!')).accessToken;

  const customer = await registerCustomer('principal');
  auth.customer = customer.accessToken;
  created.customerId = customer.user.id;

  const other = await registerCustomer('ajeno');
  auth.otherCustomer = other.accessToken;
}, 30000);

afterAll(async () => {
  if (created.userIds.length > 0) {
    await db.none('DELETE FROM orders WHERE customer_id = ANY($1)', [created.userIds]);
    await db.none('DELETE FROM properties WHERE user_id = ANY($1)', [created.userIds]);
    await db.none('DELETE FROM addresses WHERE user_id = ANY($1)', [created.userIds]);
    await db.none('DELETE FROM users WHERE id = ANY($1)', [created.userIds]);
  }
  await pgp.end();
});

describe('Crear un inmueble', () => {
  it('se crea vinculado a una direccion guardada', async () => {
    const addr = await createAddress(auth.customer);
    created.addressId = addr.body.address.id;

    const res = await createProperty(auth.customer, {
      name: 'Departamento 5B',
      propertyType: 'APARTMENT',
      bedrooms: 2,
      bathrooms: 2,
      accessCode: '4821#',
      addressId: created.addressId,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.property.name).toBe('Departamento 5B');
    expect(res.body.property.propertyType).toBe('APARTMENT');
    expect(res.body.property.accessCode).toBeNull();
    expect(res.body.property.hasAccessCode).toBe(true);

    // El codigo de acceso queda cifrado, nunca en texto plano.
    const row = await db.one('SELECT access_code FROM properties WHERE id = $1', [
      res.body.property.id,
    ]);
    expect(row.access_code).toMatch(/^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(row.access_code).not.toContain('4821');

    created.propertyId = res.body.property.id;
  });

  it('se crea con una direccion nueva al vuelo', async () => {
    const res = await createProperty(auth.customer, {
      name: 'Casa de mi madre',
      propertyType: 'HOUSE',
      bedrooms: 3,
      bathrooms: 2,
      address: newAddress({ label: 'Casa de mi madre' }),
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.property.propertyType).toBe('HOUSE');

    const linked = await db.one(
      'SELECT address_id FROM properties WHERE id = $1',
      [res.body.property.id],
    );
    expect(linked.address_id).not.toBeNull();
  });

  it('el codigo de acceso es opcional', async () => {
    // Una direccion distinta: cada direccion admite un solo inmueble, y la del
    // primer test ya tiene el suyo.
    const addr = await createAddress(auth.customer, { label: 'Oficina' });
    created.secondAddressId = addr.body.address.id;

    const res = await createProperty(auth.customer, {
      name: 'Oficina',
      propertyType: 'OFFICE',
      bedrooms: 0,
      bathrooms: 1,
      addressId: created.secondAddressId,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.property.accessCode).toBeNull();
  });

  it('guarda el perfil completo de acceso al crearse', async () => {
    const addr = await createAddress(auth.customer, { label: 'Casa con acceso' });
    created.accessAddressId = addr.body.address.id;

    const res = await createProperty(auth.customer, {
      name: 'Casa con acceso',
      propertyType: 'HOUSE',
      bedrooms: 3,
      bathrooms: 3,
      accessCode: '1234#',
      accessMethod: 'DOOR_CODE',
      accessInstructions: 'El codigo abre la puerta principal.',
      parkingInstructions: 'Parqueadero visitas, puesto 3.',
      customerPresent: false,
      hasPets: true,
      pets: [{ type: 'dog', count: 1, name: 'Toby', behavior: 'Amistoso' }],
      petsSecured: false,
      petInstructions: 'Toby queda suelto, no da problema.',
      delicateItems: 'El jarrón del pasillo no se mueve.',
      addressId: created.accessAddressId,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.property.accessMethod).toBe('DOOR_CODE');
    expect(res.body.property.hasPets).toBe(true);
    expect(res.body.property.pets).toEqual([
      { type: 'dog', count: 1, name: 'Toby', behavior: 'Amistoso' },
    ]);
    expect(res.body.property.delicateItems).toContain('jarrón');
    created.accessPropertyId = res.body.property.id;
  });

  it('rechaza un cuerpo sin direccion (ni guardada ni nueva)', async () => {
    const res = await createProperty(auth.customer, {
      name: 'Sin direccion',
      propertyType: 'APARTMENT',
    });
    expect(res.status).toBe(400);
  });

  it('rechaza valores de tipo de inmueble fuera del dominio', async () => {
    const res = await createProperty(auth.customer, {
      name: 'Tipo invalido',
      propertyType: 'Studio',
      addressId: created.addressId,
    });
    expect(res.status).toBe(400);
  });

  it('no permite vincular la direccion de otro cliente', async () => {
    const ajena = await createAddress(auth.otherCustomer);
    const res = await createProperty(auth.customer, {
      name: 'Casa ajena',
      propertyType: 'APARTMENT',
      addressId: ajena.body.address.id,
    });

    // 404 y no 403: no confirmar que la direccion existe.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('el ADMIN no puede crear inmuebles en el arbol del cliente', async () => {
    const res = await createProperty(auth.admin, {
      name: 'Casa admin',
      propertyType: 'APARTMENT',
      addressId: created.addressId,
    });
    expect(res.status).toBe(403);
  });
});

describe('Leer inmuebles y direcciones', () => {
  it('el listado de inmuebles llega unido a su direccion', async () => {
    const res = await request(app)
      .get('/api/customer/properties')
      .set('Authorization', `Bearer ${auth.customer}`);

    expect(res.status).toBe(200);
    const prop = res.body.properties.find((p) => p.id === created.propertyId);
    expect(prop).toBeDefined();
    expect(prop.address.id).toBe(created.addressId);
    expect(prop.address.streetLine1).toContain('Amazonas');
  });

  it('el listado de direcciones devuelve el inmueble que vive en ella', async () => {
    const res = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`);

    expect(res.status).toBe(200);
    const addr = res.body.addresses.find((a) => a.id === created.addressId);
    expect(addr).toBeDefined();
    // Exactamente lo que la reserva necesita para pre-rellenar identidad y
    // acceso, nada mas: el codigo llega descifrado como en el listado propio.
    expect(addr.property).toEqual({
      id: created.propertyId,
      name: 'Departamento 5B',
      propertyType: 'APARTMENT',
      bedrooms: 2,
      bathrooms: 2,
      accessCode: null,
      hasAccessCode: true,
      notes: null,
      accessMethod: null,
      accessInstructions: null,
      parkingInstructions: null,
      customerPresent: true,
      hasPets: false,
      pets: [],
      petsSecured: null,
      petInstructions: null,
      delicateItems: null,
    });
  });

  it('una direccion sin inmueble llega con property nulo', async () => {
    const nueva = await createAddress(auth.customer, { label: 'Oficina' });

    const res = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`);

    const addr = res.body.addresses.find((a) => a.id === nueva.body.address.id);
    expect(addr.property).toBeNull();
  });

  it('un cliente solo ve sus inmuebles', async () => {
    const res = await request(app)
      .get('/api/customer/properties')
      .set('Authorization', `Bearer ${auth.otherCustomer}`);

    expect(res.status).toBe(200);
    expect(res.body.properties.every((p) => p.id !== created.propertyId)).toBe(true);
  });
});

describe('Actualizar un inmueble (PATCH)', () => {
  it('actualiza solo los campos enviados', async () => {
    const res = await request(app)
      .patch(`/api/customer/properties/${created.accessPropertyId}`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        accessCode: '9999#',
        accessInstructions: 'Entrar por el portón trasero.',
        customerPresent: true,
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.property.accessCode).toBeNull();
    expect(res.body.property.hasAccessCode).toBe(true);
    expect(res.body.property.accessInstructions).toContain('portón');
    expect(res.body.property.customerPresent).toBe(true);
    // Los campos ausentes se quedan como estaban.
    expect(res.body.property.parkingInstructions).toContain('puesto 3');
    expect(res.body.property.hasPets).toBe(true);
    expect(res.body.property.name).toBe('Casa con acceso');

    // El codigo se cifra antes de guardarse.
    const row = await db.one('SELECT access_code FROM properties WHERE id = $1', [
      created.accessPropertyId,
    ]);
    expect(row.access_code).toMatch(/^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(row.access_code).not.toContain('9999');
  });

  it('permite limpiar el codigo de acceso y reemplazar mascotas', async () => {
    const res = await request(app)
      .patch(`/api/customer/properties/${created.accessPropertyId}`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        accessCode: null,
        hasPets: false,
        pets: [],
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.property.accessCode).toBeNull();
    expect(res.body.property.hasAccessCode).toBe(false);
    expect(res.body.property.hasPets).toBe(false);
    expect(res.body.property.pets).toEqual([]);
  });

  it('rechaza un cuerpo vacio', async () => {
    const res = await request(app)
      .patch(`/api/customer/properties/${created.accessPropertyId}`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rechaza mover la direccion: la pertenencia no se edita aqui', async () => {
    const res = await request(app)
      .patch(`/api/customer/properties/${created.accessPropertyId}`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ addressId: created.secondAddressId });
    expect(res.status).toBe(400);
  });

  it('no permite actualizar el inmueble de otro cliente', async () => {
    const res = await request(app)
      .patch(`/api/customer/properties/${created.accessPropertyId}`)
      .set('Authorization', `Bearer ${auth.otherCustomer}`)
      .send({ name: 'Casa ajena' });
    // 404 y no 403: no confirmar que el inmueble existe.
    expect(res.status).toBe(404);
  });

  it('el listado de direcciones pre-rellena el acceso actualizado', async () => {
    const res = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`);

    expect(res.status).toBe(200);
    const addr = res.body.addresses.find((a) => a.id === created.accessAddressId);
    expect(addr.property).toBeDefined();
    expect(addr.property.accessMethod).toBe('DOOR_CODE');
    expect(addr.property.accessInstructions).toContain('portón');
    expect(addr.property.hasPets).toBe(false);
    expect(addr.property.accessCode).toBeNull();
  });
});

describe('Eliminar inmuebles', () => {
  it('borra un inmueble propio', async () => {
    const addr = await createAddress(auth.customer, { label: 'Temporal' });
    const prop = await createProperty(auth.customer, {
      name: 'Temporal',
      propertyType: 'SUITE',
      addressId: addr.body.address.id,
    });

    const res = await request(app)
      .delete(`/api/customer/properties/${prop.body.property.id}`)
      .set('Authorization', `Bearer ${auth.customer}`);

    expect(res.status).toBe(204);

    const sigue = await db.oneOrNone('SELECT id FROM properties WHERE id = $1', [
      prop.body.property.id,
    ]);
    expect(sigue).toBeNull();
  });

  it('no permite borrar el inmueble de otro cliente', async () => {
    const res = await request(app)
      .delete(`/api/customer/properties/${created.propertyId}`)
      .set('Authorization', `Bearer ${auth.otherCustomer}`);
    expect(res.status).toBe(404);
  });
});
