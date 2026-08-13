'use strict';

/**
 * Direcciones con ubicacion en el mapa.
 *
 * La idea que se prueba una y otra vez aqui: la coordenada y el texto son dos
 * datos distintos y complementarios. Se puede corregir el texto sin mover el
 * punto, mover el punto sin perder el texto, y la direccion tiene que seguir
 * sirviendo aunque el proveedor de mapas no aparezca por ningun lado.
 */

const request = require('supertest');
const { createApp } = require('../src/http/app');
const { db, pgp } = require('../src/db');
const { locateZone, coverageEnvelope, distanceKm } = require('../src/domain/shared/serviceArea');

const app = createApp();

const stamp = Date.now();
const auth = {};
const created = { userIds: [] };

// Puntos reales de Quito y alrededores.
const QUITO_CENTRO_NORTE = { latitude: -0.1807, longitude: -78.4678 };
const GALAPAGOS = { latitude: -0.7431, longitude: -90.3131 };

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, `login ${email}: ${JSON.stringify(res.body)}`).toBe(200);
  return res.body;
}

async function registerCustomer(suffix) {
  const res = await request(app).post('/api/auth/register').send({
    email: `test.direcciones.${stamp}.${suffix}@ejemplo.com`,
    password: 'Cliente123!',
    firstName: 'Cliente',
    lastName: 'Direcciones',
    phone: '+593991234510',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  created.userIds.push(res.body.user.id);
  return res.body;
}

function newAddress(overrides = {}) {
  return {
    label: 'Casa',
    streetLine1: 'Av. Ilaló y Los Cipreses',
    streetLine2: 'Urbanización Los Jardines, casa 18',
    neighborhood: 'La Carolina',
    city: 'Quito',
    administrativeArea: 'Pichincha',
    reference: 'Junto al parque, portón verde',
    ...QUITO_CENTRO_NORTE,
    ...overrides,
  };
}

async function createAddress(token, overrides) {
  return request(app)
    .post('/api/customer/addresses')
    .set('Authorization', `Bearer ${token}`)
    .send(newAddress(overrides));
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
    await db.none('DELETE FROM addresses WHERE user_id = ANY($1)', [created.userIds]);
    await db.none('DELETE FROM users WHERE id = ANY($1)', [created.userIds]);
  }
  await pgp.end();
});

describe('Cobertura (dominio, sin base de datos)', () => {
  const zones = [
    { id: 1, name: 'Norte', center_latitude: -0.15, center_longitude: -78.48, radius_km: 9 },
    { id: 2, name: 'Valles', center_latitude: -0.25, center_longitude: -78.44, radius_km: 13 },
    { id: 3, name: 'Sin cobertura', center_latitude: null, center_longitude: null, radius_km: null },
  ];

  it('ubica un punto en la zona que lo contiene', () => {
    const result = locateZone(QUITO_CENTRO_NORTE, zones);
    expect(result.checked).toBe(true);
    expect(result.covered).toBe(true);
    expect(result.zone.name).toBe('Norte');
  });

  it('rechaza lo que no cae en ninguna zona', () => {
    const result = locateZone(GALAPAGOS, zones);
    expect(result.checked).toBe(true);
    expect(result.covered).toBe(false);
    expect(result.zone).toBeNull();
  });

  it('sin zonas con cobertura no rechaza nada: la restriccion no es por defecto', () => {
    const result = locateZone(GALAPAGOS, [zones[2]]);
    expect(result.checked).toBe(false);
    expect(result.covered).toBe(true);
  });

  it('sin coordenadas no hay nada que comprobar', () => {
    expect(locateZone(null, zones).checked).toBe(false);
    expect(locateZone({ latitude: null, longitude: null }, zones).covered).toBe(true);
  });

  it('el circulo que envuelve la operacion alcanza todas las zonas', () => {
    const envelope = coverageEnvelope(zones);
    for (const zone of zones.filter((z) => z.radius_km)) {
      const reach =
        distanceKm(envelope.center, {
          latitude: Number(zone.center_latitude),
          longitude: Number(zone.center_longitude),
        }) + Number(zone.radius_km);
      expect(envelope.radiusKm + 0.01).toBeGreaterThanOrEqual(reach);
    }
  });
});

describe('Guardar la ubicacion', () => {
  it('guarda coordenadas junto al texto y resuelve la zona sola', async () => {
    const res = await createAddress(auth.customer, { googlePlaceId: 'ChIJ_ejemplo_quito' });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(Number(res.body.address.latitude)).toBeCloseTo(QUITO_CENTRO_NORTE.latitude, 4);
    expect(Number(res.body.address.longitude)).toBeCloseTo(QUITO_CENTRO_NORTE.longitude, 4);
    expect(res.body.address.google_place_id).toBe('ChIJ_ejemplo_quito');
    // El texto que escribio el cliente se respeta tal cual.
    expect(res.body.address.street_line2).toContain('Los Jardines');
    expect(res.body.address.reference).toContain('portón verde');
    // La zona sale de la coordenada, no de un desplegable.
    expect(res.body.address.zone_id).not.toBeNull();
    expect(res.body.serviceArea.covered).toBe(true);

    created.addressId = res.body.address.id;
  });

  it('rechaza coordenadas imposibles', async () => {
    const res = await createAddress(auth.customer, { latitude: 95, longitude: -78.4 });
    expect(res.status).toBe(400);
  });

  it('una direccion sin coordenadas se sigue guardando', async () => {
    const res = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        label: 'Oficina',
        streetLine1: 'Av. República del Salvador',
        city: 'Quito',
        administrativeArea: 'Pichincha',
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.address.latitude).toBeNull();
    // No se comprobo nada, asi que no se rechaza nada.
    expect(res.body.serviceArea.checked).toBe(false);
  });

  it('guardar una ubicacion fuera de cobertura no se bloquea, pero se avisa', async () => {
    const res = await createAddress(auth.customer, {
      label: 'Casa de mi madre',
      ...GALAPAGOS,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.serviceArea.checked).toBe(true);
    expect(res.body.serviceArea.covered).toBe(false);
    expect(res.body.address.zone_id).toBeNull();

    created.outOfAreaId = res.body.address.id;
  });
});

describe('Corregir la direccion', () => {
  it('se puede cambiar el texto sin tocar las coordenadas', async () => {
    const original = await db.one('SELECT * FROM addresses WHERE id = $1', [created.addressId]);

    const res = await request(app)
      .patch(`/api/customer/addresses/${created.addressId}`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        streetLine1: 'Av. Ilaló',
        streetLine2: 'Urbanización Los Jardines, casa 18',
        reference: 'Junto al parque, timbre 2',
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.address.street_line1).toBe('Av. Ilaló');
    expect(res.body.address.reference).toContain('timbre 2');
    // El punto no se movio.
    expect(Number(res.body.address.latitude)).toBe(Number(original.latitude));
    expect(Number(res.body.address.longitude)).toBe(Number(original.longitude));
    expect(res.body.address.zone_id).toBe(original.zone_id);
  });

  it('se puede mover el punto sin perder el texto', async () => {
    const res = await request(app)
      .patch(`/api/customer/addresses/${created.addressId}`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ latitude: -0.2969, longitude: -78.4547 });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(Number(res.body.address.latitude)).toBeCloseTo(-0.2969, 4);
    // El texto corregido a mano sigue ahi.
    expect(res.body.address.street_line2).toContain('Los Jardines');
    // Y la zona se recalcula con la coordenada nueva.
    expect(res.body.serviceArea.covered).toBe(true);
    expect(res.body.address.zone_id).not.toBeNull();
  });

  it('un cliente no puede tocar la direccion de otro', async () => {
    const ajena = await request(app)
      .patch(`/api/customer/addresses/${created.addressId}`)
      .set('Authorization', `Bearer ${auth.otherCustomer}`)
      .send({ reference: 'Me la quedo yo' });

    // 404 y no 403: confirmar que existe ya seria decir demasiado.
    expect(ajena.status).toBe(404);

    const borrado = await request(app)
      .delete(`/api/customer/addresses/${created.addressId}`)
      .set('Authorization', `Bearer ${auth.otherCustomer}`);
    expect(borrado.status).toBe(404);

    // Sigue intacta.
    const sigue = await db.one('SELECT reference FROM addresses WHERE id = $1', [created.addressId]);
    expect(sigue.reference).not.toContain('Me la quedo yo');
  });

  it('el ADMIN no puede crear direcciones en el arbol del cliente', async () => {
    const res = await createAddress(auth.admin);
    expect(res.status).toBe(403);
  });

  it('un cuerpo vacio no pasa por valido', async () => {
    const res = await request(app)
      .patch(`/api/customer/addresses/${created.addressId}`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('Reservar solo donde atendemos', () => {
  it('una ubicacion fuera de la zona no puede usarse para reservar', async () => {
    const plans = await request(app).get('/api/catalog/services/cleaning/plans');
    const plan = plans.body.plans[0];

    const date = new Date();
    date.setDate(date.getDate() + 3);

    const res = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: plan.id,
        addressId: created.outOfAreaId,
        scheduledDate: date.toISOString().slice(0, 10),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 180 },
        cleaning: { propertyType: 'APARTMENT', bedrooms: 2, bathrooms: 1 },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error.code).toBe('OUT_OF_SERVICE_AREA');
  });

  it('la misma reserva funciona en una direccion cubierta', async () => {
    const plans = await request(app).get('/api/catalog/services/cleaning/plans');
    const plan = plans.body.plans[0];

    const date = new Date();
    date.setDate(date.getDate() + 3);

    const res = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: plan.id,
        addressId: created.addressId,
        scheduledDate: date.toISOString().slice(0, 10),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 180 },
        cleaning: { propertyType: 'APARTMENT', bedrooms: 2, bathrooms: 1 },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });
});

describe('Sin proveedor de mapas', () => {
  it('una direccion guardada sigue intacta y editable sin datos de Google', async () => {
    // Simula lo que queda si Google no responde: sin place_id y sin punto.
    const res = await request(app)
      .patch(`/api/customer/addresses/${created.addressId}`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ googlePlaceId: null, streetLine1: 'Av. Ilaló y Los Cipreses' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.address.google_place_id).toBeNull();
    // Lo importante: la direccion sigue completa y con su punto.
    expect(res.body.address.street_line1).toBe('Av. Ilaló y Los Cipreses');
    expect(res.body.address.latitude).not.toBeNull();

    const listed = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(listed.status).toBe(200);
    expect(listed.body.addresses.length).toBeGreaterThan(0);
    // Cada direccion llega con su inmueble vinculado (o null), nunca ausente.
    expect(listed.body.addresses.every((a) => Object.prototype.hasOwnProperty.call(a, 'property'))).toBe(true);
  });

  it('la orientacion del buscador sale de las zonas, no de una constante', async () => {
    const res = await request(app).get('/api/catalog/config');

    expect(res.status).toBe(200);
    expect(res.body.maps.regionCode).toBe('ec');
    expect(res.body.maps.bias.center.latitude).toBeLessThan(0);
    expect(res.body.maps.bias.radiusMeters).toBeGreaterThan(0);
  });
});
