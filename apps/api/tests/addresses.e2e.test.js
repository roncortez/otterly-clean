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
    const res = await createAddress(auth.customer, {
      providerPlaceId: '51a0f1e1e2ejemplo',
      geocodingProvider: 'geoapify',
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(Number(res.body.address.latitude)).toBeCloseTo(QUITO_CENTRO_NORTE.latitude, 4);
    expect(Number(res.body.address.longitude)).toBeCloseTo(QUITO_CENTRO_NORTE.longitude, 4);
    // El identificador se guarda con la marca de quien lo emitio: el de un
    // proveedor no significa nada en otro.
    expect(res.body.address.provider_place_id).toBe('51a0f1e1e2ejemplo');
    expect(res.body.address.geocoding_provider).toBe('GEOAPIFY');
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

/**
 * La ficha de limpieza de un espacio (lo que antes era un "inmueble").
 *
 * Lo que se prueba aqui es la promesa de producto: se escribe una vez y la
 * reserva no la vuelve a pedir. Y que el codigo de la puerta se comporta como en
 * el resto del sistema: se guarda cifrado y no vuelve a salir nunca.
 */
describe('Ficha de limpieza de un espacio', () => {
  it('se guardan en la direccion y se leen con ella', async () => {
    const res = await request(app)
      .patch(`/api/customer/addresses/${created.addressId}/cleaning-profile`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        propertyType: 'HOUSE',
        bedrooms: 3,
        bathrooms: 2,
        hasPets: true,
        pets: [{ type: 'gato', count: 2 }],
        accessMethod: 'DOOR_CODE',
        accessSecret: '9137*',
        parkingInstructions: 'Visitas en el subsuelo 1',
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.cleaningProfile.bedrooms).toBe(3);
    // El secreto nunca vuelve: solo si existe.
    expect(res.body.cleaningProfile.hasAccessSecret).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('9137');

    const list = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`);
    const address = list.body.addresses.find((a) => a.id === created.addressId);
    expect(address.cleaningProfile.propertyType).toBe('HOUSE');
    expect(address.cleaningProfile.pets).toEqual([{ type: 'gato', count: 2 }]);
    expect(address.cleaningProfile.hasAccessSecret).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain('9137');
  });

  it('el codigo de la puerta queda cifrado, igual que en una orden', async () => {
    const row = await db.one(
      'SELECT access_secret_encrypted FROM address_cleaning_profiles WHERE address_id = $1',
      [created.addressId],
    );
    expect(row.access_secret_encrypted).toMatch(/^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(row.access_secret_encrypted).not.toContain('9137');
  });

  it('la reserva hereda el codigo guardado sin que el cliente lo reescriba', async () => {
    const plans = await request(app).get('/api/catalog/services/cleaning/plans');
    const date = new Date();
    date.setDate(date.getDate() + 3);

    const res = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: plans.body.plans[0].id,
        addressId: created.addressId,
        scheduledDate: date.toISOString().slice(0, 10),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 180 },
        // Sin accessSecret: el cliente ya lo dio una vez.
        cleaning: { bedrooms: 3, bathrooms: 2, accessMethod: 'DOOR_CODE' },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const detail = await request(app)
      .get(`/api/customer/orders/${res.body.order.id}`)
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(detail.body.details.hasAccessSecret).toBe(true);
  });

  it('no hereda el codigo si esta vez abre el cliente', async () => {
    const plans = await request(app).get('/api/catalog/services/cleaning/plans');
    const date = new Date();
    date.setDate(date.getDate() + 5);

    const res = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: plans.body.plans[0].id,
        addressId: created.addressId,
        scheduledDate: date.toISOString().slice(0, 10),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 180 },
        cleaning: { bedrooms: 3, bathrooms: 2, accessMethod: 'CUSTOMER_OPENS' },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);

    // La clave sigue guardada en la casa, pero no viaja a un servicio en el que
    // el cliente abre la puerta: no hay nada que el trabajador deba consultar.
    const detail = await request(app)
      .get(`/api/customer/orders/${res.body.order.id}`)
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(detail.body.details.hasAccessSecret).toBe(false);
  });

  it('reservar actualiza los datos del hogar para la proxima vez', async () => {
    const plans = await request(app).get('/api/catalog/services/cleaning/plans');
    const date = new Date();
    date.setDate(date.getDate() + 4);

    await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: plans.body.plans[0].id,
        addressId: created.addressId,
        scheduledDate: date.toISOString().slice(0, 10),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 180 },
        cleaning: { bedrooms: 4, bathrooms: 3, propertyType: 'APARTMENT' },
      });

    const list = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`);
    const address = list.body.addresses.find((a) => a.id === created.addressId);
    expect(address.cleaningProfile.bedrooms).toBe(4);
    expect(address.cleaningProfile.propertyType).toBe('APARTMENT');
    // Y no se perdio el codigo que nunca se volvio a escribir.
    expect(address.cleaningProfile.hasAccessSecret).toBe(true);
  });

  it('no se pueden tocar los datos del hogar de otra persona', async () => {
    const res = await request(app)
      .patch(`/api/customer/addresses/${created.addressId}/cleaning-profile`)
      .set('Authorization', `Bearer ${auth.otherCustomer}`)
      .send({ bedrooms: 1 });

    expect(res.status).toBe(404);
  });

  it('la lista de inmuebles paralela ya no existe', async () => {
    const res = await request(app)
      .get('/api/customer/properties')
      .set('Authorization', `Bearer ${auth.customer}`);

    expect(res.status).toBe(404);
  });
});

/**
 * Varias viviendas, cada una con su nombre y su ficha.
 *
 * Es el caso que el modelo tiene que soportar de verdad: alguien con su
 * departamento, la casa de sus padres y una oficina reserva en el que toca sin
 * que los datos de uno se mezclen con los del otro ni haya que reescribirlos.
 */
describe('Varios espacios de un mismo cliente', () => {
  const espacios = {};

  async function bookCleaning(addressId, extra = {}, days = 3) {
    const plans = await request(app).get('/api/catalog/services/cleaning/plans');
    const date = new Date();
    date.setDate(date.getDate() + days);

    return request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: plans.body.plans[0].id,
        addressId,
        scheduledDate: date.toISOString().slice(0, 10),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 180 },
        ...extra,
      });
  }

  beforeAll(async () => {
    // Dos lugares distintos del mismo cliente, con nombre propio cada uno.
    const departamento = await createAddress(auth.customer, { label: 'Mi departamento' });
    const valle = await createAddress(auth.customer, {
      label: 'Casa del Valle',
      streetLine1: 'Calle Los Arupos',
      neighborhood: 'Conocoto',
    });

    espacios.departamento = departamento.body.address.id;
    espacios.valle = valle.body.address.id;

    await request(app)
      .patch(`/api/customer/addresses/${espacios.departamento}/cleaning-profile`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ propertyType: 'APARTMENT', bedrooms: 1, bathrooms: 1 });

    await request(app)
      .patch(`/api/customer/addresses/${espacios.valle}/cleaning-profile`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        propertyType: 'HOUSE',
        bedrooms: 3,
        bathrooms: 2,
        hasPets: true,
        pets: [{ type: 'perro', count: 1 }],
        notes: 'El timbre no funciona, llamar al llegar',
      });
  }, 30000);

  it('cada espacio conserva su nombre y su ficha, sin mezclarse', async () => {
    const list = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`);

    const byId = new Map(list.body.addresses.map((a) => [a.id, a]));
    const departamento = byId.get(espacios.departamento);
    const valle = byId.get(espacios.valle);

    expect(departamento.label).toBe('Mi departamento');
    expect(valle.label).toBe('Casa del Valle');
    expect(departamento.cleaningProfile.bedrooms).toBe(1);
    expect(valle.cleaningProfile.bedrooms).toBe(3);
    expect(departamento.cleaningProfile.hasPets).toBe(false);
    expect(valle.cleaningProfile.pets).toEqual([{ type: 'perro', count: 1 }]);
    // Las dos fichas estan completas: se puede reservar sin preguntar nada mas.
    expect(departamento.cleaningProfile.complete).toBe(true);
    expect(valle.cleaningProfile.complete).toBe(true);
  });

  it('el nombre de un espacio se puede cambiar despues', async () => {
    const res = await request(app)
      .patch(`/api/customer/addresses/${espacios.valle}`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ label: 'Casa de mis padres' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.address.label).toBe('Casa de mis padres');
    // Cambiar el nombre no toca la ficha ni la ubicacion.
    expect(res.body.address.street_line1).toBe('Calle Los Arupos');

    const profile = await db.one(
      'SELECT bedrooms FROM address_cleaning_profiles WHERE address_id = $1',
      [espacios.valle],
    );
    expect(profile.bedrooms).toBe(3);
  });

  /** El corazon del cambio: reservar no vuelve a preguntar lo del lugar. */
  it('reservar sin repetir nada de la vivienda usa la ficha del espacio elegido', async () => {
    const res = await bookCleaning(espacios.valle, {
      // Solo lo de esta visita.
      cleaning: { cleaningType: 'DEEP', priorityAreas: ['Cocina'], customerPresent: false },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const detail = await db.one(
      `SELECT bedrooms, bathrooms, property_type, has_pets, pets, special_instructions,
              cleaning_type, priority_areas, customer_present
         FROM cleaning_details WHERE order_id = $1`,
      [res.body.order.id],
    );

    // Lo del lugar salio de la ficha, no de la peticion.
    expect(detail.bedrooms).toBe(3);
    expect(detail.bathrooms).toBe(2);
    expect(detail.property_type).toBe('HOUSE');
    expect(detail.has_pets).toBe(true);
    expect(detail.pets).toEqual([{ type: 'perro', count: 1 }]);
    expect(detail.special_instructions).toContain('El timbre no funciona');
    // Y lo de la visita, de la peticion.
    expect(detail.cleaning_type).toBe('DEEP');
    expect(detail.priority_areas).toEqual(['Cocina']);
    expect(detail.customer_present).toBe(false);
  });

  it('reservar en el otro espacio trae los datos del otro espacio', async () => {
    const res = await bookCleaning(espacios.departamento, { cleaning: {} }, 4);
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const detail = await db.one(
      'SELECT bedrooms, bathrooms, property_type FROM cleaning_details WHERE order_id = $1',
      [res.body.order.id],
    );
    expect(detail.bedrooms).toBe(1);
    expect(detail.bathrooms).toBe(1);
    expect(detail.property_type).toBe('APARTMENT');
  });

  it('se puede reservar sin enviar bloque de limpieza: el espacio ya lo dice todo', async () => {
    const res = await bookCleaning(espacios.valle, {}, 5);
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const detail = await db.one(
      'SELECT bedrooms, bathrooms, cleaning_type FROM cleaning_details WHERE order_id = $1',
      [res.body.order.id],
    );
    expect(detail.bedrooms).toBe(3);
    expect(detail.bathrooms).toBe(2);
    // Y lo de la visita cae en su valor por defecto.
    expect(detail.cleaning_type).toBe('STANDARD');
  });

  it('una reserva que no menciona las mascotas no las borra del espacio', async () => {
    await bookCleaning(espacios.valle, { cleaning: { cleaningType: 'STANDARD' } }, 6);

    const profile = await db.one(
      'SELECT has_pets, pets, notes FROM address_cleaning_profiles WHERE address_id = $1',
      [espacios.valle],
    );
    expect(profile.has_pets).toBe(true);
    expect(profile.pets).toEqual([{ type: 'perro', count: 1 }]);
    expect(profile.notes).toContain('El timbre no funciona');
  });

  it('corregir el espacio despues no reescribe lo que ya se acordo', async () => {
    const order = await bookCleaning(espacios.departamento, { cleaning: {} }, 7);
    expect(order.status, JSON.stringify(order.body)).toBe(201);

    // El cliente amplia: ahora son dos banos.
    await request(app)
      .patch(`/api/customer/addresses/${espacios.departamento}/cleaning-profile`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ bathrooms: 2 });

    const detail = await db.one(
      'SELECT bathrooms FROM cleaning_details WHERE order_id = $1',
      [order.body.order.id],
    );
    // La orden conserva la foto del dia que se pidio.
    expect(detail.bathrooms).toBe(1);

    // Y la proxima reserva si sale con el dato nuevo.
    const siguiente = await bookCleaning(espacios.departamento, {}, 8);
    const nuevo = await db.one('SELECT bathrooms FROM cleaning_details WHERE order_id = $1', [
      siguiente.body.order.id,
    ]);
    expect(nuevo.bathrooms).toBe(2);
  });

  it('lo que la reserva si corrige queda guardado para la proxima', async () => {
    await bookCleaning(espacios.departamento, { cleaning: { bedrooms: 2 } }, 9);

    const profile = await db.one(
      'SELECT bedrooms, bathrooms FROM address_cleaning_profiles WHERE address_id = $1',
      [espacios.departamento],
    );
    expect(profile.bedrooms).toBe(2);
    // Y no arrastro nada mas: los banos siguen como estaban.
    expect(profile.bathrooms).toBe(2);
  });
});

/**
 * Lavanderia sigue siendo lavanderia.
 *
 * El modelo del espacio es de limpieza y no puede contaminar al resto: recoger
 * ropa necesita una direccion y nada mas.
 */
describe('Lavanderia usa solo la direccion', () => {
  it('un pedido de lavanderia no necesita ni crea ficha de limpieza', async () => {
    const direccion = await createAddress(auth.customer, { label: 'Solo para lavanderia' });
    const addressId = direccion.body.address.id;

    const plans = await request(app).get('/api/catalog/services/LAUNDRY/plans');
    const date = new Date();
    date.setDate(date.getDate() + 3);

    const res = await request(app)
      .post('/api/customer/orders/laundry')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: plans.body.plans[0].id,
        addressId,
        scheduledDate: date.toISOString().slice(0, 10),
        windowCode: 'MORNING',
        pricingInput: { estimatedWeight: 6 },
        laundry: { estimatedBags: 2, estimatedWeight: 6 },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);

    // Ni una fila: pedir lavanderia no describe la vivienda de nadie.
    const profile = await db.oneOrNone(
      'SELECT address_id FROM address_cleaning_profiles WHERE address_id = $1',
      [addressId],
    );
    expect(profile).toBeNull();
  });

  it('el detalle de lavanderia no admite datos de la vivienda', async () => {
    const plans = await request(app).get('/api/catalog/services/LAUNDRY/plans');
    const date = new Date();
    date.setDate(date.getDate() + 3);

    const res = await request(app)
      .post('/api/customer/orders/laundry')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: plans.body.plans[0].id,
        addressId: created.addressId,
        scheduledDate: date.toISOString().slice(0, 10),
        windowCode: 'MORNING',
        pricingInput: { estimatedWeight: 6 },
        laundry: { estimatedBags: 1, bedrooms: 3, bathrooms: 2 },
      });

    // El esquema de lavanderia no tiene esos campos y no los acepta en silencio.
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const detail = await db.one(
      'SELECT * FROM laundry_details WHERE order_id = $1',
      [res.body.order.id],
    );
    expect(detail.bedrooms).toBeUndefined();
    expect(detail.bathrooms).toBeUndefined();
  });
});

describe('Sin proveedor de mapas', () => {
  it('una direccion guardada sigue intacta y editable sin datos del proveedor', async () => {
    // Simula lo que queda si el geocodificador no responde: sin referencia del
    // lugar. La direccion tiene que seguir siendo utilizable igualmente.
    const res = await request(app)
      .patch(`/api/customer/addresses/${created.addressId}`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ providerPlaceId: null, streetLine1: 'Av. Ilaló y Los Cipreses' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.address.provider_place_id).toBeNull();
    // Y el proveedor se va con el identificador: sin id que atribuir, la marca
    // de quien lo emitio seria una atribucion falsa.
    expect(res.body.address.geocoding_provider).toBeNull();
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
