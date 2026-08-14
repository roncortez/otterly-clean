'use strict';

/**
 * Pruebas de integracion de los dos flujos que son el corazon del producto.
 *
 * Corren contra la base de datos real (la misma que usa el entorno de
 * desarrollo), no contra mocks: se crea un cliente nuevo por ejecucion y se
 * recorre el ciclo completo cliente -> operaciones -> trabajador -> cliente.
 */

const request = require('supertest');
const { createApp } = require('../src/http/app');
const { db, pgp } = require('../src/db');

const app = createApp();

// Correo unico por ejecucion para no chocar con datos previos.
const stamp = Date.now();
const customerEmail = `test.cliente.${stamp}@ejemplo.com`;

const auth = {};
const created = {};

/** Fecha futura que respeta la antelacion minima de 3 horas. */
function futureDate(daysAhead = 3) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, `login ${email}: ${JSON.stringify(res.body)}`).toBe(200);
  return res.body;
}

beforeAll(async () => {
  const admin = await login('admin@otterlyclean.ec', 'Admin123!');
  auth.admin = admin.accessToken;

  const cleaner = await login('carla.mendez@otterlyclean.ec', 'Staff123!');
  auth.cleaner = cleaner.accessToken;
  created.cleanerId = cleaner.user.id;

  const laundryStaff = await login('jorge.paredes@otterlyclean.ec', 'Staff123!');
  auth.laundryStaff = laundryStaff.accessToken;
  created.laundryStaffId = laundryStaff.user.id;

  // Cliente nuevo para esta ejecucion.
  const registered = await request(app).post('/api/auth/register').send({
    email: customerEmail,
    password: 'Cliente123!',
    firstName: 'Test',
    lastName: 'Cliente',
    phone: '+593991234567',
  });
  expect(registered.status, JSON.stringify(registered.body)).toBe(201);
  auth.customer = registered.body.accessToken;
  created.customerId = registered.body.user.id;
}, 30000);

afterAll(async () => {
  // Limpieza: borra solo lo creado por esta ejecucion.
  if (created.customerId) {
    await db.none('DELETE FROM orders WHERE customer_id = $1', [created.customerId]);
    await db.none('DELETE FROM users WHERE id = $1', [created.customerId]);
  }
  await pgp.end();
});

describe('Configuracion regional', () => {
  it('sirve la configuracion de Ecuador sin datos hardcodeados en el cliente', async () => {
    const res = await request(app).get('/api/catalog/config');

    expect(res.status).toBe(200);
    expect(res.body.region.code).toBe('EC');
    expect(res.body.region.currency.code).toBe('USD');
    expect(res.body.region.tax.rate).toBe(0.15);
    expect(res.body.region.tax.label).toBe('IVA');
    expect(res.body.region.phone.countryCallingCode).toBe('+593');
    // En Ecuador el campo se llama Provincia, no State.
    expect(res.body.region.address.labels.administrative_area).toBe('Provincia');
    expect(res.body.region.address.postalCodeRequired).toBe(false);
  });

  it('sirve la configuracion de EE.UU. con el mismo contrato', async () => {
    const res = await request(app).get('/api/catalog/config?region=US');

    expect(res.status).toBe(200);
    expect(res.body.region.address.labels.administrative_area).toBe('State');
    expect(res.body.region.address.postalCodeRequired).toBe(true);
    expect(res.body.region.units.area).toBe('sqft');
  });

  it('expone arreglo de prendas como definido pero no reservable', async () => {
    const res = await request(app).get('/api/catalog/config');
    const alteration = res.body.serviceTypes.find((s) => s.code === 'ALTERATION');

    expect(alteration).toBeDefined();
    // Dos preguntas distintas: el dominio no lo implementa todavia y
    // Operaciones tampoco lo ofrece. Ninguna de las dos permite reservarlo.
    expect(alteration.implemented).toBe(false);
    expect(alteration.active).toBe(false);
    expect(alteration.bookable).toBe(false);
  });

  it('sirve los datos publicos de la empresa sin exponer configuracion tecnica', async () => {
    const res = await request(app).get('/api/catalog/company');

    expect(res.status).toBe(200);
    expect(res.body.company.name).toBeTruthy();
    // Ningun secreto puede salir por el endpoint publico.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/jwtSecret|JWT_SECRET|encryptionKey|password/i);
  });
});

describe('Seguridad y control de acceso', () => {
  it('rechaza sin token', async () => {
    const res = await request(app).get('/api/operations/orders');
    expect(res.status).toBe(401);
  });

  it('impide a un cliente entrar a Operaciones', async () => {
    const res = await request(app)
      .get('/api/operations/orders')
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(res.status).toBe(403);
  });

  it('impide a un trabajador entrar a Operaciones', async () => {
    const res = await request(app)
      .get('/api/operations/staff')
      .set('Authorization', `Bearer ${auth.cleaner}`);
    expect(res.status).toBe(403);
  });

  it('no permite que el registro publico cree un ADMIN', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `escalada.${stamp}@ejemplo.com`,
        password: 'Cliente123!',
        firstName: 'Intento',
        lastName: 'Escalada',
        role: 'ADMIN', // se ignora
        roles: ['ADMIN'], // tambien se ignora
      });

    expect(res.status).toBe(201);
    expect(res.body.user.roles).toEqual(['CUSTOMER']);

    // Y tampoco quedo escrito en la base por otra via.
    const granted = await db.any('SELECT role FROM user_roles WHERE user_id = $1', [
      res.body.user.id,
    ]);
    expect(granted.map((row) => row.role)).toEqual(['CUSTOMER']);

    await db.none('DELETE FROM users WHERE id = $1', [res.body.user.id]);
  });
});

describe('Flujo completo de limpieza', () => {
  it('el cliente crea una direccion', async () => {
    const res = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        label: 'Casa',
        streetLine1: 'Av. Shyris N38-120',
        streetLine2: 'y Naciones Unidas',
        neighborhood: 'La Carolina',
        city: 'Quito',
        administrativeArea: 'Pichincha',
        reference: 'Edificio Metropolitan, piso 4',
        // El punto exacto que marco en el mapa, dentro de Quito Norte.
        latitude: -0.1755432,
        longitude: -78.4823119,
        isDefault: true,
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    created.addressId = res.body.address.id;
    created.addressPoint = { latitude: -0.1755432, longitude: -78.4823119 };
  });

  it('cotiza limpieza por hora con IVA de Ecuador', async () => {
    const plans = await request(app).get('/api/catalog/services/CLEANING/plans');
    const standard = plans.body.plans.find((p) => p.code === 'EC-CLN-STANDARD');
    created.cleaningPlanId = standard.id;

    const res = await request(app)
      .post('/api/customer/quote')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: standard.id,
        pricingInput: { durationMinutes: 240 },
        extraCodes: ['CLEAN-OVEN'],
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // 4 horas x $11.00 = $44.00, mas horno $8.00 = $52.00
    expect(res.body.pricing.subtotal).toBe(5200);
    // IVA 15% sobre 52.00 = 7.80
    expect(res.body.pricing.tax).toBe(780);
    expect(res.body.pricing.total).toBe(5980);
    expect(res.body.pricing.currency).toBe('USD');
  });

  /**
   * El catalogo ofrece un plan de cada cosa, no dos.
   *
   * Convivieron dos familias de planes —la del seed y la de la migracion 008— y
   * el cliente veia "Limpieza estándar" y "Limpieza Estándar" seguidos, a
   * precios distintos. La 016 retira los del seed; esto vigila que no vuelvan,
   * porque el sintoma solo se ve en la pantalla de reservar.
   */
  it('no ofrece planes duplicados del catalogo antiguo', async () => {
    const res = await request(app).get('/api/catalog/services/CLEANING/plans');
    const codes = res.body.plans.map((plan) => plan.code);

    expect(codes).toContain('EC-CLN-STANDARD');
    expect(codes).not.toContain('EC-CLEAN-STANDARD');
    expect(codes).not.toContain('EC-CLEAN-DEEP');
    expect(codes).not.toContain('EC-CLEAN-MOVE');

    // Y ningun nombre aparece dos veces, se llame como se llame el codigo.
    const names = res.body.plans.map((plan) => plan.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('rechaza una reserva que no respeta la antelacion minima', async () => {
    const res = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: created.addressId,
        // Una fecha ya pasada: incumple la antelacion minima a cualquier hora.
        // Con "hoy" la prueba dependia del reloj —de madrugada, la franja de la
        // manana todavia queda a mas de las tres horas de antelacion y la
        // reserva era legitima—, asi que fallaba sola entre medianoche y las
        // cinco de la manana.
        scheduledDate: futureDate(-1),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 180 },
        cleaning: { propertyType: 'APARTMENT', bedrooms: 2, bathrooms: 1 },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SCHEDULE_TOO_SOON');
  });

  it('el cliente solicita la limpieza', async () => {
    const res = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: created.addressId,
        scheduledDate: futureDate(3),
        windowCode: 'MORNING',
        extraCodes: ['CLEAN-OVEN'],
        pricingInput: { durationMinutes: 180 },
        customerNotes: 'Timbre no funciona, llamar al llegar.',
        cleaning: {
          cleaningType: 'STANDARD',
          propertyType: 'APARTMENT',
          bedrooms: 2,
          bathrooms: 2,
          areaValue: 95,
          priorityAreas: ['cocina', 'baños'],
          suppliesProvidedBy: 'COMPANY',
          // Codigo del catalogo, no texto libre: ver migracion 014.
          fragrancePreference: 'NONE',
          customerPresent: false,
          accessMethod: 'DOOR_CODE',
          accessInstructions: 'Puerta principal del edificio, luego departamento 4B',
          accessSecret: '4821#',
          hasPets: true,
          pets: [{ type: 'perro', count: 1, name: 'Rocky', behavior: 'amistoso' }],
          petsSecured: true,
          petInstructions: 'Estara en el cuarto de servicio.',
          specialInstructions: 'No mover los cuadros de la sala.',
        },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.order.status).toBe('REQUESTED');
    expect(res.body.order.reference).toMatch(/^OC-\d{4}-\d{6}$/);
    created.cleaningOrderId = res.body.order.id;
    created.cleaningReference = res.body.order.reference;
  });

  it('el codigo de acceso queda cifrado en la base de datos', async () => {
    const row = await db.one('SELECT access_secret_encrypted FROM cleaning_details WHERE order_id = $1', [
      created.cleaningOrderId,
    ]);

    expect(row.access_secret_encrypted).toBeTruthy();
    // Nunca en texto plano.
    expect(row.access_secret_encrypted).not.toContain('4821');
    expect(row.access_secret_encrypted).toMatch(/^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('Operaciones ve la solicitud como no asignada', async () => {
    const res = await request(app)
      .get('/api/operations/orders?unassignedOnly=true&activeOnly=true')
      .set('Authorization', `Bearer ${auth.admin}`);

    expect(res.status).toBe(200);
    const order = res.body.data.find((o) => o.id === created.cleaningOrderId);
    expect(order).toBeDefined();
    expect(order.assignedStaff).toHaveLength(0);
  });

  it('el trabajador todavia no ve el trabajo', async () => {
    const res = await request(app)
      .get(`/api/staff/jobs/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.cleaner}`);

    expect(res.status).toBe(404);
  });

  it('Operaciones asigna un trabajador', async () => {
    const candidates = await request(app)
      .get(`/api/operations/orders/${created.cleaningOrderId}/candidates`)
      .set('Authorization', `Bearer ${auth.admin}`);

    expect(candidates.status).toBe(200);
    expect(candidates.body.candidates.length).toBeGreaterThan(0);

    const res = await request(app)
      .post(`/api/operations/orders/${created.cleaningOrderId}/assign`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ staffId: created.cleanerId });

    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const detail = await request(app)
      .get(`/api/operations/orders/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.admin}`);
    expect(detail.body.order.status).toBe('ASSIGNED');
  });

  it('un trabajador no asignado sigue sin poder verlo', async () => {
    const other = await login('lucia.torres@otterlyclean.ec', 'Staff123!');
    const res = await request(app)
      .get(`/api/staff/jobs/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${other.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('el trabajador asignado ve el trabajo sin datos innecesarios del cliente', async () => {
    const res = await request(app)
      .get(`/api/staff/jobs/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.cleaner}`);

    expect(res.status).toBe(200);
    // Minimo privilegio: solo el nombre de pila para saber a quien atiende.
    expect(res.body.order.customer.firstName).toBe('Test');
    expect(res.body.order.customer.email).toBeUndefined();
    expect(res.body.order.totalAmount).toBeUndefined();
    // El codigo de acceso no viaja en la respuesta normal.
    expect(res.body.details.access_secret_encrypted).toBeUndefined();
    expect(res.body.details.hasAccessSecret).toBe(true);
  });

  /**
   * Privacidad del cliente: recibir una asignacion no es haberla aceptado.
   * Mientras no exista compromiso, el trabajador no se lleva el telefono ni la
   * llave de la casa.
   */
  it('sin confirmar todavia no tiene el telefono del cliente ni el codigo de acceso', async () => {
    const res = await request(app)
      .get(`/api/staff/jobs/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.cleaner}`);

    expect(res.body.order.customer.phone).toBeUndefined();
    expect(res.body.order.customer.phoneAvailable).toBe(false);
    expect(res.body.assignment).toEqual({ status: 'OFFERED', accepted: false });
    expect(res.body.details.canRevealAccessSecret).toBe(false);

    const secret = await request(app)
      .get(`/api/staff/jobs/${created.cleaningOrderId}/access-secret`)
      .set('Authorization', `Bearer ${auth.cleaner}`);
    expect(secret.status).toBe(403);
  });

  it('tampoco puede reportar una incidencia sobre un trabajo que no ha confirmado', async () => {
    const res = await request(app)
      .post(`/api/staff/jobs/${created.cleaningOrderId}/incidents`)
      .set('Authorization', `Bearer ${auth.cleaner}`)
      .send({ category: 'OTHER', description: 'Reporte antes de aceptar el trabajo.' });

    expect(res.status, JSON.stringify(res.body)).toBe(403);

    const incidents = await db.any('SELECT * FROM incidents WHERE order_id = $1', [
      created.cleaningOrderId,
    ]);
    expect(incidents).toHaveLength(0);
  });

  it('exige confirmar la asignacion antes de poder actualizar el servicio', async () => {
    const res = await request(app)
      .post(`/api/staff/jobs/${created.cleaningOrderId}/status`)
      .set('Authorization', `Bearer ${auth.cleaner}`)
      .send({ status: 'ON_THE_WAY' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('el trabajador confirma la asignacion', async () => {
    const accept = await request(app)
      .post(`/api/staff/jobs/${created.cleaningOrderId}/accept`)
      .set('Authorization', `Bearer ${auth.cleaner}`);

    expect(accept.status, JSON.stringify(accept.body)).toBe(200);
    expect(accept.body.order.status).toBe('CONFIRMED');
  });

  it('al confirmar aparece el telefono del cliente, y no antes', async () => {
    const res = await request(app)
      .get(`/api/staff/jobs/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.cleaner}`);

    expect(res.body.assignment).toEqual({ status: 'ACCEPTED', accepted: true });
    expect(res.body.order.customer.phone).toBe('+593991234567');
    expect(res.body.order.customer.phoneAvailable).toBe(true);
    // Sigue sin ver lo que nunca le corresponde.
    expect(res.body.order.customer.email).toBeUndefined();
    expect(res.body.order.customer.lastName).toBeUndefined();
  });

  /**
   * La ubicacion que el trabajador usa para llegar es EXACTAMENTE la que marco
   * el cliente. Sin esto, la pantalla acaba buscando el texto de la direccion en
   * un mapa y aterrizando en la manzana de al lado.
   */
  it('el trabajador recibe la coordenada exacta que el cliente guardo', async () => {
    const res = await request(app)
      .get(`/api/staff/jobs/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.cleaner}`);

    expect(res.body.order.address.coordinates).toEqual(created.addressPoint);
    // Numeros, no cadenas: NUMERIC llega como texto desde PostgreSQL.
    expect(typeof res.body.order.address.coordinates.latitude).toBe('number');

    // Y es la misma que ve el cliente en su propia direccion.
    const suya = await request(app)
      .get(`/api/customer/orders/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(suya.body.order.address.coordinates).toEqual(created.addressPoint);
  });

  it('confirmar es un compromiso: ya no puede rechazar el trabajo por su cuenta', async () => {
    const res = await request(app)
      .post(`/api/staff/jobs/${created.cleaningOrderId}/decline`)
      .set('Authorization', `Bearer ${auth.cleaner}`)
      .send({ reason: 'Me surgio otra cosa' });

    expect(res.status, JSON.stringify(res.body)).toBe(409);

    // Y la orden sigue confirmada y con su trabajador.
    const detail = await request(app)
      .get(`/api/operations/orders/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.admin}`);
    expect(detail.body.order.status).toBe('CONFIRMED');
    expect(detail.body.assignedStaff[0].assignmentStatus).toBe('ACCEPTED');
  });

  it('no permite saltarse pasos de la maquina de estados', async () => {
    // Ya confirmado, pero saltar de CONFIRMED directo a COMPLETED es ilegal.
    const res = await request(app)
      .post(`/api/staff/jobs/${created.cleaningOrderId}/status`)
      .set('Authorization', `Bearer ${auth.cleaner}`)
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('el trabajador consulta el codigo de acceso y queda auditado', async () => {
    const res = await request(app)
      .get(`/api/staff/jobs/${created.cleaningOrderId}/access-secret`)
      .set('Authorization', `Bearer ${auth.cleaner}`);

    expect(res.status).toBe(200);
    expect(res.body.accessSecret).toBe('4821#');

    const log = await db.any(
      "SELECT * FROM audit_log WHERE action = 'ACCESS_SECRET_VIEWED' AND entity_id = $1",
      [String(created.cleaningOrderId)],
    );
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].actor_id).toBe(created.cleanerId);
  });

  it('el trabajador recorre el ciclo operativo completo', async () => {
    for (const status of ['ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED']) {
      const res = await request(app)
        .post(`/api/staff/jobs/${created.cleaningOrderId}/status`)
        .set('Authorization', `Bearer ${auth.cleaner}`)
        .send({ status });

      expect(res.status, `${status}: ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.body.order.status).toBe(status);
    }
  });

  it('tras completar, el trabajador conserva el historial pero pierde el acceso sensible', async () => {
    const detail = await request(app)
      .get(`/api/staff/jobs/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.cleaner}`);

    // Sigue viendo su trabajo terminado...
    expect(detail.status).toBe(200);
    expect(detail.body.order.status).toBe('COMPLETED');
    // ...pero ya no puede pedir el codigo de la casa.
    expect(detail.body.details.canRevealAccessSecret).toBe(false);

    const secret = await request(app)
      .get(`/api/staff/jobs/${created.cleaningOrderId}/access-secret`)
      .set('Authorization', `Bearer ${auth.cleaner}`);
    expect(secret.status).toBe(404);
  });

  it('el cliente ve el timeline completo con marcas de tiempo', async () => {
    const res = await request(app)
      .get(`/api/customer/orders/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.customer}`);

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('COMPLETED');

    const done = res.body.timeline.filter((step) => step.state === 'DONE');
    expect(done.map((s) => s.status)).toEqual(
      expect.arrayContaining(['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED']),
    );
    // Cada hito operativo registro su timestamp.
    expect(res.body.order.milestones.arrived_at).toBeTruthy();
    expect(res.body.order.milestones.started_at).toBeTruthy();
    expect(res.body.order.milestones.completed_at).toBeTruthy();

    // El cliente ve al profesional, pero solo su ficha publica.
    expect(res.body.assignedStaff[0].displayName).toBe('Carla');
    expect(res.body.assignedStaff[0].isVerified).toBe(true);
    expect(res.body.assignedStaff[0].phone).toBeUndefined();
  });

  it('registra en auditoria quien asigno y quien cambio cada estado', async () => {
    const res = await request(app)
      .get(`/api/operations/orders/${created.cleaningOrderId}`)
      .set('Authorization', `Bearer ${auth.admin}`);

    const actions = res.body.auditTrail.map((entry) => entry.action);
    expect(actions).toContain('STAFF_ASSIGNED');
    expect(actions).toContain('ORDER_STATUS_CHANGED');
    expect(actions).toContain('ORDER_CREATED');
  });
});

describe('Flujo completo de lavanderia', () => {
  it('el cliente solicita la recogida', async () => {
    const plans = await request(app).get('/api/catalog/services/LAUNDRY/plans');
    const washFold = plans.body.plans.find((p) => p.code === 'EC-LAU-WASHFOLD');
    created.laundryPlanId = washFold.id;

    const res = await request(app)
      .post('/api/customer/orders/laundry')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: washFold.id,
        addressId: created.addressId,
        scheduledDate: futureDate(2),
        windowCode: 'AFTERNOON',
        pricingInput: { estimatedWeight: 8 },
        laundry: {
          serviceVariant: 'WASH_AND_FOLD',
          estimatedBags: 2,
          estimatedWeight: 8,
          weightUnit: 'kg',
          billingMode: 'PER_WEIGHT',
          washTemperature: 'COLD',
          detergentPreference: 'HYPOALLERGENIC',
          useFabricSoftener: false,
          separateColors: true,
          dryingPreference: 'MIXED',
          hangDryItems: 'Camisas de lino y vestido negro',
          doNotProcessItems: 'Saco de lana gris, no lavar',
          pickupInstructions: 'Dejar las bolsas con el conserje',
        },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.order.status).toBe('REQUESTED');
    created.laundryOrderId = res.body.order.id;
    created.laundryReference = res.body.order.reference;
  });

  it('cobra por peso con el minimo del plan', async () => {
    const res = await request(app)
      .get(`/api/customer/orders/${created.laundryOrderId}`)
      .set('Authorization', `Bearer ${auth.customer}`);

    // 8 kg x $2.50 = $20.00 + IVA 15% = $23.00
    expect(res.body.order.subtotalAmount).toBe(2000);
    expect(res.body.order.totalAmount).toBe(2300);
  });

  it('Operaciones asigna al responsable de lavanderia', async () => {
    const res = await request(app)
      .post(`/api/operations/orders/${created.laundryOrderId}/assign`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ staffId: created.laundryStaffId });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('recorre toda la cadena logistica con trazabilidad', async () => {
    const accept = await request(app)
      .post(`/api/staff/jobs/${created.laundryOrderId}/accept`)
      .set('Authorization', `Bearer ${auth.laundryStaff}`);
    expect(accept.status, JSON.stringify(accept.body)).toBe(200);
    expect(accept.body.order.status).toBe('PICKUP_CONFIRMED');

    const chain = [
      'PICKED_UP',
      'RECEIVED',
      'PROCESSING',
      'WASHING',
      'DRYING',
      'FOLDING',
      'READY_FOR_DELIVERY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ];

    for (const status of chain) {
      const res = await request(app)
        .post(`/api/staff/jobs/${created.laundryOrderId}/status`)
        .set('Authorization', `Bearer ${auth.laundryStaff}`)
        .send({ status });

      expect(res.status, `${status}: ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.body.order.status).toBe(status);
    }
  });

  it('registra bolsas identificadas con la referencia de la orden', async () => {
    const res = await request(app)
      .post(`/api/staff/jobs/${created.laundryOrderId}/bags`)
      .set('Authorization', `Bearer ${auth.laundryStaff}`)
      .send({
        bags: [
          { label: 'Ropa de color', weight: 4.5, weightUnit: 'kg', itemCount: 22 },
          { label: 'Blancos', weight: 3.2, weightUnit: 'kg', itemCount: 15 },
        ],
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.bags).toHaveLength(2);
    // El codigo de bolsa dice a que orden pertenece: evita confundir clientes.
    for (const bag of res.body.bags) {
      expect(bag.bag_code).toContain(created.laundryReference);
    }

    // El peso real de la orden se recalcula desde las bolsas pesadas.
    const details = await db.one('SELECT actual_weight FROM laundry_details WHERE order_id = $1', [
      created.laundryOrderId,
    ]);
    expect(Number(details.actual_weight)).toBeCloseTo(7.7, 1);
  });

  it('el cliente sigue la trazabilidad completa', async () => {
    const res = await request(app)
      .get(`/api/customer/orders/${created.laundryOrderId}`)
      .set('Authorization', `Bearer ${auth.customer}`);

    expect(res.body.order.status).toBe('DELIVERED');
    expect(res.body.order.milestones.picked_up_at).toBeTruthy();
    expect(res.body.order.milestones.received_at).toBeTruthy();
    expect(res.body.order.milestones.washing_at).toBeTruthy();
    expect(res.body.order.milestones.drying_at).toBeTruthy();
    expect(res.body.order.milestones.folding_at).toBeTruthy();
    expect(res.body.order.milestones.delivered_at).toBeTruthy();

    const bags = await request(app)
      .get(`/api/customer/orders/${created.laundryOrderId}/bags`)
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(bags.body.bags).toHaveLength(2);
  });

  it('Operaciones cierra la orden', async () => {
    const res = await request(app)
      .post(`/api/operations/orders/${created.laundryOrderId}/status`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ status: 'COMPLETED' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.order.status).toBe('COMPLETED');
  });
});

describe('Incidencias y cancelacion', () => {
  it('el trabajador reporta una incidencia y la orden lo refleja', async () => {
    const order = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: created.addressId,
        scheduledDate: futureDate(4),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 120 },
        cleaning: {
          propertyType: 'APARTMENT',
          bedrooms: 1,
          bathrooms: 1,
          customerPresent: false,
          accessMethod: 'CONCIERGE',
        },
      });
    const orderId = order.body.order.id;

    await request(app)
      .post(`/api/operations/orders/${orderId}/assign`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ staffId: created.cleanerId });

    await request(app)
      .post(`/api/staff/jobs/${orderId}/accept`)
      .set('Authorization', `Bearer ${auth.cleaner}`);
    await request(app)
      .post(`/api/staff/jobs/${orderId}/status`)
      .set('Authorization', `Bearer ${auth.cleaner}`)
      .send({ status: 'ON_THE_WAY' });
    await request(app)
      .post(`/api/staff/jobs/${orderId}/status`)
      .set('Authorization', `Bearer ${auth.cleaner}`)
      .send({ status: 'ARRIVED' });

    const incident = await request(app)
      .post(`/api/staff/jobs/${orderId}/incidents`)
      .set('Authorization', `Bearer ${auth.cleaner}`)
      .send({
        category: 'NO_ACCESS',
        description: 'La recepcion no tiene autorizacion para dejarme entrar.',
      });

    expect(incident.status, JSON.stringify(incident.body)).toBe(201);
    expect(incident.body.statusChanged).toBe(true);
    // El trabajador cuenta que paso; la gravedad la pone Operaciones despues.
    expect(incident.body.incident.severity).toBeNull();
    created.incidentId = incident.body.incident.id;

    const detail = await request(app)
      .get(`/api/customer/orders/${orderId}`)
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(detail.body.order.status).toBe('NO_ACCESS');
    // El estado excepcional aparece explicitamente en el timeline del cliente.
    expect(detail.body.timeline.some((s) => s.state === 'EXCEPTION')).toBe(true);

    const open = await request(app)
      .get('/api/operations/incidents')
      .set('Authorization', `Bearer ${auth.admin}`);
    expect(open.body.incidents.some((i) => i.order_id === orderId)).toBe(true);
  });

  it('el trabajador no puede decidir la gravedad: enviarla es un error, no un dato ignorado', async () => {
    const res = await request(app)
      .post(`/api/staff/jobs/${created.cleaningOrderId}/incidents`)
      .set('Authorization', `Bearer ${auth.cleaner}`)
      .send({ category: 'DAMAGE', description: 'Se rompio un vaso.', severity: 'LOW' });

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('Operaciones clasifica la gravedad y queda auditado quien lo hizo', async () => {
    const res = await request(app)
      .patch(`/api/operations/incidents/${created.incidentId}/severity`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ severity: 'HIGH', note: 'El cliente se quedo sin servicio.' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.incident.severity).toBe('HIGH');
    expect(res.body.incident.classified_at).toBeTruthy();

    const log = await db.any(
      "SELECT * FROM audit_log WHERE action = 'INCIDENT_CLASSIFIED' AND entity_id = $1",
      [String(created.incidentId)],
    );
    expect(log.length).toBe(1);
    expect(log[0].before.severity).toBeNull();
    expect(log[0].after.severity).toBe('HIGH');
  });

  it('el trabajador no tiene ninguna ruta para clasificar', async () => {
    const res = await request(app)
      .patch(`/api/operations/incidents/${created.incidentId}/severity`)
      .set('Authorization', `Bearer ${auth.cleaner}`)
      .send({ severity: 'LOW' });

    expect(res.status).toBe(403);
  });

  /**
   * Cancelacion del cliente: hasta que alguien se pone en marcha.
   * La regla vive en la maquina de estados y se aplica igual desde cualquier
   * endpoint; aqui se comprueba de extremo a extremo, con la orden en curso.
   */
  it('el cliente no puede cancelar con el profesional ya en camino, Operaciones si', async () => {
    const order = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: created.addressId,
        scheduledDate: futureDate(4),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 120 },
        cleaning: { bedrooms: 1, bathrooms: 1 },
      });
    const orderId = order.body.order.id;

    await request(app)
      .post(`/api/operations/orders/${orderId}/assign`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ staffId: created.cleanerId });
    await request(app)
      .post(`/api/staff/jobs/${orderId}/accept`)
      .set('Authorization', `Bearer ${auth.cleaner}`);

    // Confirmado pero sin salir todavia: el cliente aun manda sobre su reserva.
    const antes = await request(app)
      .get(`/api/customer/orders/${orderId}`)
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(antes.body.availableTransitions.map((t) => t.to)).toContain('CANCELLED');

    await request(app)
      .post(`/api/staff/jobs/${orderId}/status`)
      .set('Authorization', `Bearer ${auth.cleaner}`)
      .send({ status: 'ON_THE_WAY' });

    const rechazada = await request(app)
      .post(`/api/customer/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ reason: 'Ya no me viene bien' });
    expect(rechazada.status, JSON.stringify(rechazada.body)).toBe(403);
    expect(rechazada.body.error.code).toBe('FORBIDDEN_TRANSITION');

    // Y la pantalla del cliente deja de ofrecerlo, porque lee lo mismo.
    const despues = await request(app)
      .get(`/api/customer/orders/${orderId}`)
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(despues.body.order.status).toBe('ON_THE_WAY');
    expect(despues.body.availableTransitions.map((t) => t.to)).not.toContain('CANCELLED');

    // Operaciones sigue pudiendo gestionar la excepcion.
    const porOperaciones = await request(app)
      .post(`/api/operations/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ reason: 'El cliente llamo a Operaciones' });
    expect(porOperaciones.status, JSON.stringify(porOperaciones.body)).toBe(200);
    expect(porOperaciones.body.cancelled).toBe(true);
  });

  it('el cliente cancela y la politica marca si fue tardia', async () => {
    const order = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: created.addressId,
        scheduledDate: futureDate(10),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 120 },
        cleaning: { propertyType: 'APARTMENT', bedrooms: 1, bathrooms: 1 },
      });

    const res = await request(app)
      .post(`/api/customer/orders/${order.body.order.id}/cancel`)
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ reason: 'Cambio de planes' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.cancelled).toBe(true);
    // Faltan 10 dias: muy por encima de las 24 horas de la politica de Ecuador.
    expect(res.body.late).toBe(false);
    expect(res.body.freeCancellationHours).toBe(24);
  });

  it('no permite usar la direccion de otra persona como entrega', async () => {
    const intruso = await request(app).post('/api/auth/register').send({
      email: `intruso.${stamp}@ejemplo.com`,
      password: 'Cliente123!',
      firstName: 'Intruso',
      lastName: 'Prueba',
    });

    const plans = await request(app).get('/api/catalog/services/LAUNDRY/plans');
    const plan = plans.body.plans.find((p) => p.code === 'EC-LAU-WASHFOLD');

    const propia = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${intruso.body.accessToken}`)
      .send({ streetLine1: 'Calle Falsa 123', city: 'Quito', administrativeArea: 'Pichincha' });

    const res = await request(app)
      .post('/api/customer/orders/laundry')
      .set('Authorization', `Bearer ${intruso.body.accessToken}`)
      .send({
        planId: plan.id,
        addressId: propia.body.address.id,
        // Direccion de OTRO cliente: debe rechazarse.
        deliveryAddressId: created.addressId,
        scheduledDate: futureDate(3),
        windowCode: 'MORNING',
        pricingInput: { estimatedWeight: 5 },
        laundry: {},
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    await db.none('DELETE FROM orders WHERE customer_id = $1', [intruso.body.user.id]);
    await db.none('DELETE FROM users WHERE id = $1', [intruso.body.user.id]);
  });

  it('no permite que un cliente cancele la orden de otro', async () => {
    const otro = await request(app).post('/api/auth/register').send({
      email: `otro.${stamp}@ejemplo.com`,
      password: 'Cliente123!',
      firstName: 'Otro',
      lastName: 'Cliente',
    });

    const res = await request(app)
      .post(`/api/customer/orders/${created.cleaningOrderId}/cancel`)
      .set('Authorization', `Bearer ${otro.body.accessToken}`)
      .send({ reason: 'intento' });

    expect(res.status).toBe(404);
    await db.none('DELETE FROM users WHERE id = $1', [otro.body.user.id]);
  });
});

describe('Panel de operaciones', () => {
  it('responde las preguntas del dia a dia', async () => {
    const res = await request(app)
      .get('/api/operations/dashboard')
      .set('Authorization', `Bearer ${auth.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toHaveProperty('unassigned');
    expect(res.body.summary).toHaveProperty('openIncidents');
    expect(res.body.summary).toHaveProperty('activeStaff');
    expect(Array.isArray(res.body.unassigned)).toBe(true);
    expect(Array.isArray(res.body.openIncidents)).toBe(true);
  });

  it('crea un trabajador desde Operaciones, no por registro publico', async () => {
    const res = await request(app)
      .post('/api/operations/staff')
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({
        email: `nuevo.staff.${stamp}@otterlyclean.ec`,
        firstName: 'Nuevo',
        lastName: 'Trabajador',
        phone: '+593991000099',
        serviceTypes: ['CLEANING'],
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    // Nace sin verificar: no puede recibir trabajos todavia.
    expect(res.body.staff.verification_status).toBe('PENDING');
    // Y sin contrasena: se activa con la invitacion que emite el sistema.
    expect(res.body.invitation.status).toBe('PENDING');

    const staffId = res.body.staff.id;

    const assign = await request(app)
      .post(`/api/operations/orders/${created.cleaningOrderId}/assign`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ staffId });
    expect(assign.status).toBe(409);

    await db.none('DELETE FROM users WHERE id = $1', [staffId]);
  });
});

describe('Vinculo con el inmueble', () => {
  /** Reserva de limpieza mínima pero valida, sobre la direccion del cliente. */
  const reservar = (payload = {}) =>
    request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: created.addressId,
        scheduledDate: futureDate(5),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 120 },
        cleaning: { propertyType: 'APARTMENT', bedrooms: 1, bathrooms: 1 },
        ...payload,
      });

  /**
   * Esta prueba exigia antes que la reserva repitiera SIEMPRE la identidad del
   * espacio (tipo, habitaciones, banos), y se rechazaba con 400 si faltaba.
   *
   * Ya no: los datos estables son del lugar y la reserva los hereda cuando no
   * los menciona (ver domain/cleaning/placeProfile). Repetirlos en cada reserva
   * era justamente el formulario duplicado que se venia a quitar.
   *
   * Lo que se comprueba ahora es que omitirlos no inventa nada: sin lugar
   * guardado, la orden se crea con los valores por defecto del dominio y no con
   * datos de otra casa. Que HEREDE del lugar cuando existe lo cubre
   * addresses.e2e.test.js.
   */
  it('sin lugar guardado, omitir los datos del espacio no inventa otros', async () => {
    const res = await reservar({ cleaning: {} });

    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const detalle = await db.one(
      'SELECT property_type, bedrooms, bathrooms FROM cleaning_details WHERE order_id = $1',
      [res.body.order.id],
    );
    expect(detalle.property_type).toBe('APARTMENT');
    expect(detalle.bedrooms).toBe(0);
    expect(detalle.bathrooms).toBe(0);
  });

  it('vincula el inmueble que la direccion ya tiene', async () => {
    const property = await request(app)
      .post('/api/customer/properties')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        name: 'Mi depto de prueba',
        propertyType: 'APARTMENT',
        bedrooms: 2,
        bathrooms: 1,
        addressId: created.addressId,
      });
    expect(property.status, JSON.stringify(property.body)).toBe(201);
    created.propertyId = property.body.property.id;

    // Sin propertyId: el servidor deriva el del inmueble guardado en la direccion.
    const res = await reservar();

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.order.propertyId).toBe(created.propertyId);

    const detalle = await request(app)
      .get(`/api/customer/orders/${res.body.order.id}`)
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(detalle.body.order.property.name).toBe('Mi depto de prueba');
    expect(detalle.body.order.property.propertyType).toBe('APARTMENT');

    const guardado = await db.one('SELECT property_id FROM orders WHERE id = $1', [
      res.body.order.id,
    ]);
    expect(guardado.property_id).toBe(created.propertyId);
  });

  it('rechaza un inmueble de otra direccion', async () => {
    // El cliente tiene otra direccion con su propio inmueble. Si manda ese
    // propertyId en una reserva para la otra casa, no corresponde.
    const otra = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        streetLine1: 'Calle de la otra casa',
        city: 'Quito',
        administrativeArea: 'Pichincha',
      });
    expect(otra.status, JSON.stringify(otra.body)).toBe(201);

    const otroInmueble = await request(app)
      .post('/api/customer/properties')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        name: 'Casa de otra direccion',
        propertyType: 'HOUSE',
        bedrooms: 3,
        bathrooms: 2,
        addressId: otra.body.address.id,
      });
    expect(otroInmueble.status, JSON.stringify(otroInmueble.body)).toBe(201);

    const res = await reservar({ propertyId: otroInmueble.body.property.id });

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.code).toBe('PROPERTY_MISMATCH');
  });

  it('con un inmueble indicado, la orden lo referencia', async () => {
    const res = await reservar({ propertyId: created.propertyId });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.order.propertyId).toBe(created.propertyId);
  });

  it('una limpieza con la casilla desmarcada no exige inmueble guardado', async () => {
    // Direccion sin inmueble guardado (creada antes de que existiera el de
    // prueba): la identidad viaja en el detalle, sin propertyId, y aun asi se
    // puede reservar. Es el caso del wizard con "Guardar para proximas reservas"
    // desmarcado.
    const sinInmueble = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        streetLine1: 'Av. para limpiar sin guardar',
        city: 'Quito',
        administrativeArea: 'Pichincha',
      });
    expect(sinInmueble.status, JSON.stringify(sinInmueble.body)).toBe(201);

    const res = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: sinInmueble.body.address.id,
        scheduledDate: futureDate(6),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 120 },
        cleaning: { propertyType: 'APARTMENT', bedrooms: 1, bathrooms: 1 },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.order.propertyId).toBeNull();

    const guardado = await db.one('SELECT property_id FROM orders WHERE id = $1', [
      res.body.order.id,
    ]);
    expect(guardado.property_id).toBeNull();
  });
});
