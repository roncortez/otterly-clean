'use strict';

/**
 * Pruebas de la configuracion administrable de la plataforma.
 *
 * Cubren lo que esta feature promete y lo que podria romperse sin avisar:
 * quien puede tocar la configuracion, que un servicio apagado deja de poder
 * reservarse, que el precio que fija Operaciones es el que se cobra, y que un
 * bloqueo de agenda cierra la puerta en el backend y no solo en la pantalla.
 *
 * Corren contra la base real. Todo lo que se cambia se restaura al final, para
 * que el resto de la suite y el entorno de desarrollo queden como estaban.
 */

const request = require('supertest');
const { createApp } = require('../src/http/app');
const { db, pgp } = require('../src/db');

const app = createApp();

const stamp = Date.now();
const customerEmail = `test.config.${stamp}@ejemplo.com`;

const auth = {};
const created = { blackoutIds: [] };
const original = {};

function futureDate(daysAhead = 5) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

/** 'AAAA-MM-DD' en hora local, como lo interpreta el backend. */
function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, `login ${email}: ${JSON.stringify(res.body)}`).toBe(200);
  return res.body;
}

const asAdmin = (req) => req.set('Authorization', `Bearer ${auth.admin}`);

beforeAll(async () => {
  const admin = await login('admin@otterlyclean.ec', 'Admin123!');
  auth.admin = admin.accessToken;
  created.adminId = admin.user.id;

  const staff = await login('carla.mendez@otterlyclean.ec', 'Staff123!');
  auth.staff = staff.accessToken;
  created.staffId = staff.user.id;

  // Coordinadora con ADMIN + STAFF: el caso que motiva los roles multiples.
  // Se asegura aqui en vez de darlo por hecho del seed, para que una ejecucion
  // interrumpida a mitad no deje la siguiente sin este escenario.
  await db.none(
    `INSERT INTO user_roles (user_id, role)
     SELECT id, 'ADMIN' FROM users WHERE email = 'paula.rios@otterlyclean.ec'
     ON CONFLICT DO NOTHING`,
  );

  const both = await login('paula.rios@otterlyclean.ec', 'Staff123!');
  auth.both = both.accessToken;
  created.bothId = both.user.id;

  const registered = await request(app).post('/api/auth/register').send({
    email: customerEmail,
    password: 'Cliente123!',
    firstName: 'Config',
    lastName: 'Cliente',
    phone: '+593991234599',
  });
  expect(registered.status, JSON.stringify(registered.body)).toBe(201);
  auth.customer = registered.body.accessToken;
  created.customerId = registered.body.user.id;

  const address = await request(app)
    .post('/api/customer/addresses')
    .set('Authorization', `Bearer ${auth.customer}`)
    .send({
      streetLine1: 'Av. Eloy Alfaro N32-100',
      city: 'Quito',
      administrativeArea: 'Pichincha',
      isDefault: true,
    });
  created.addressId = address.body.address.id;

  // Estado inicial que hay que devolver tal cual al terminar.
  const plan = await db.one("SELECT * FROM service_plans WHERE code = 'EC-CLEAN-STANDARD'");
  created.cleaningPlanId = plan.id;
  original.plan = { base_amount: plan.base_amount, config: plan.config, active: plan.active };

  const laundryPlan = await db.one("SELECT id FROM service_plans WHERE code = 'EC-LAUNDRY-WASHFOLD'");
  created.laundryPlanId = laundryPlan.id;

  original.services = await db.any('SELECT service_type, active FROM service_settings');
  original.company = await db.oneOrNone("SELECT value FROM app_settings WHERE key = 'company'");
}, 30000);

afterAll(async () => {
  // Restaurar: estas pruebas escriben en configuracion compartida.
  await db.none('UPDATE service_plans SET base_amount = $2, config = $3:json, active = $4 WHERE id = $1', [
    created.cleaningPlanId,
    original.plan.base_amount,
    original.plan.config,
    original.plan.active,
  ]);

  for (const service of original.services ?? []) {
    await db.none('UPDATE service_settings SET active = $2 WHERE service_type = $1', [
      service.service_type,
      service.active,
    ]);
  }

  if (original.company) {
    await db.none('UPDATE app_settings SET value = $1:json WHERE key = $2', [
      original.company.value,
      'company',
    ]);
  }

  await db.none('DELETE FROM booking_blackouts WHERE created_by = $1', [created.adminId]);

  if (created.customerId) {
    await db.none('DELETE FROM orders WHERE customer_id = $1', [created.customerId]);
    await db.none('DELETE FROM users WHERE id = $1', [created.customerId]);
  }

  await pgp.end();
});

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

describe('Roles multiples', () => {
  it('ADMIN entra a Operaciones', async () => {
    const res = await asAdmin(request(app).get('/api/operations/dashboard'));
    expect(res.status).toBe(200);
  });

  it('STAFF entra a Trabajo', async () => {
    const res = await request(app)
      .get('/api/staff/jobs/today')
      .set('Authorization', `Bearer ${auth.staff}`);
    expect(res.status).toBe(200);
  });

  it('STAFF no entra a Operaciones', async () => {
    const res = await request(app)
      .get('/api/operations/users')
      .set('Authorization', `Bearer ${auth.staff}`);
    expect(res.status).toBe(403);
  });

  it('ADMIN + STAFF entra a las dos consolas con la misma sesion', async () => {
    const operaciones = await request(app)
      .get('/api/operations/dashboard')
      .set('Authorization', `Bearer ${auth.both}`);
    const trabajo = await request(app)
      .get('/api/staff/jobs/today')
      .set('Authorization', `Bearer ${auth.both}`);

    expect(operaciones.status).toBe(200);
    expect(trabajo.status).toBe(200);
  });

  it('la sesion expone la lista completa de roles', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${auth.both}`);

    expect(res.status).toBe(200);
    expect(res.body.user.roles).toEqual(expect.arrayContaining(['ADMIN', 'STAFF']));
    // El rol unico ya no existe: quien lo lea debe migrar a `roles`.
    expect(res.body.user.role).toBeUndefined();
  });

  it('CUSTOMER no entra a Operaciones ni a Trabajo', async () => {
    const operaciones = await request(app)
      .get('/api/operations/users')
      .set('Authorization', `Bearer ${auth.customer}`);
    const trabajo = await request(app)
      .get('/api/staff/jobs/today')
      .set('Authorization', `Bearer ${auth.customer}`);

    expect(operaciones.status).toBe(403);
    expect(trabajo.status).toBe(403);
  });

  it('ADMIN concede y retira roles, y el cambio queda auditado', async () => {
    const grant = await asAdmin(
      request(app).put(`/api/operations/users/${created.customerId}/roles`),
    ).send({ roles: ['CUSTOMER', 'STAFF'] });

    expect(grant.status, JSON.stringify(grant.body)).toBe(200);
    expect(grant.body.user.roles).toEqual(expect.arrayContaining(['CUSTOMER', 'STAFF']));

    // Conceder STAFF crea la ficha operativa: sin ella no podria recibir
    // asignaciones y no aparecerian en la pantalla de trabajadores.
    const profile = await db.oneOrNone('SELECT user_id FROM staff_profiles WHERE user_id = $1', [
      created.customerId,
    ]);
    expect(profile).not.toBeNull();

    const log = await db.any(
      "SELECT * FROM audit_log WHERE action = 'USER_ROLES_UPDATED' AND entity_id = $1",
      [String(created.customerId)],
    );
    expect(log.length).toBeGreaterThan(0);

    const revoke = await asAdmin(
      request(app).put(`/api/operations/users/${created.customerId}/roles`),
    ).send({ roles: ['CUSTOMER'] });

    expect(revoke.status).toBe(200);
    expect(revoke.body.user.roles).toEqual(['CUSTOMER']);
  });

  it('rechaza dejar a una persona sin ningun rol', async () => {
    const res = await asAdmin(
      request(app).put(`/api/operations/users/${created.customerId}/roles`),
    ).send({ roles: [] });

    expect(res.status).toBe(400);
  });

  it('rechaza roles inventados', async () => {
    const res = await asAdmin(
      request(app).put(`/api/operations/users/${created.customerId}/roles`),
    ).send({ roles: ['SUPERADMIN'] });

    expect(res.status).toBe(400);
  });

  it('retirar ADMIN funciona mientras quede otro administrador', async () => {
    const ok = await asAdmin(request(app).put(`/api/operations/users/${created.bothId}/roles`)).send({
      roles: ['STAFF'],
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.user.roles).toEqual(['STAFF']);

    // Restaurar: el resto de pruebas cuenta con que tiene los dos roles.
    const restore = await asAdmin(
      request(app).put(`/api/operations/users/${created.bothId}/roles`),
    ).send({ roles: ['STAFF', 'ADMIN'] });
    expect(restore.status).toBe(200);
  });

  it('impide quedarse sin el ultimo administrador activo', async () => {
    // Se deja al administrador principal como unico ADMIN activo. Se manipula
    // la base directamente porque esto es preparacion del escenario, no la
    // conducta bajo prueba, y asi el resultado no depende de cuantos
    // administradores tenga la instalacion.
    const others = await db.any(
      `SELECT user_id, granted_by FROM user_roles WHERE role = 'ADMIN' AND user_id <> $1`,
      [created.adminId],
    );
    await db.none("DELETE FROM user_roles WHERE role = 'ADMIN' AND user_id <> $1", [
      created.adminId,
    ]);

    try {
      // Ahora es el ultimo: no puede quitarse el rol ni desactivarse.
      const selfDemote = await asAdmin(
        request(app).put(`/api/operations/users/${created.adminId}/roles`),
      ).send({ roles: ['CUSTOMER'] });

      expect(selfDemote.status).toBe(409);
      expect(selfDemote.body.error.code).toBe('CONFLICT');
      expect(selfDemote.body.error.reason).toBe('LAST_ADMIN');

      const selfDeactivate = await asAdmin(
        request(app).post(`/api/operations/users/${created.adminId}/status`),
      ).send({ active: false });

      expect(selfDeactivate.status).toBe(409);

      // Nada se aplico a medias: sigue siendo ADMIN y sigue activo.
      const stillAdmin = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${auth.admin}`);
      expect(stillAdmin.status).toBe(200);
      expect(stillAdmin.body.user.roles).toContain('ADMIN');

      const row = await db.one('SELECT status FROM users WHERE id = $1', [created.adminId]);
      expect(row.status).toBe('ACTIVE');
    } finally {
      for (const admin of others) {
        await db.none(
          `INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1, 'ADMIN', $2)
           ON CONFLICT DO NOTHING`,
          [admin.user_id, admin.granted_by],
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Seguridad de la configuracion
// ---------------------------------------------------------------------------

describe('Seguridad de la configuracion administrativa', () => {
  const adminOnlyRoutes = [
    ['patch', '/api/operations/settings/company', { name: 'Secuestrada' }],
    ['patch', '/api/operations/services/CLEANING', { active: false }],
    ['post', '/api/operations/booking-blackouts', { startsAt: '2030-01-01' }],
    ['put', '/api/operations/users/1/roles', { roles: ['ADMIN'] }],
  ];

  /** Llama a la ruta con el token indicado, sea cual sea el verbo. */
  const callAs = (token, [method, path, body]) =>
    request(app)[method](path).set('Authorization', `Bearer ${token}`).send(body);

  it('ningun CUSTOMER puede modificar la configuracion', async () => {
    for (const route of adminOnlyRoutes) {
      const res = await callAs(auth.customer, route);
      expect(res.status, `${route[0].toUpperCase()} ${route[1]}`).toBe(403);
    }
  });

  it('ningun STAFF puede modificar la configuracion', async () => {
    for (const route of adminOnlyRoutes) {
      const res = await callAs(auth.staff, route);
      expect(res.status, `${route[0].toUpperCase()} ${route[1]}`).toBe(403);
    }
  });

  it('sin sesion tampoco', async () => {
    const res = await request(app)
      .patch('/api/operations/settings/company')
      .send({ name: 'Anonima' });
    expect(res.status).toBe(401);
  });

  it('rechaza campos que no pertenecen a la configuracion de empresa', async () => {
    const res = await asAdmin(request(app).patch('/api/operations/settings/company')).send({
      name: 'Otterly Clean',
      jwtSecret: 'intento-de-inyeccion',
    });

    // El esquema es estricto: una clave desconocida no se guarda "por si acaso".
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------------

describe('Configuracion de la empresa', () => {
  it('ADMIN actualiza los datos y el frontend publico los recibe', async () => {
    const res = await asAdmin(request(app).patch('/api/operations/settings/company')).send({
      name: 'Otterly Clean Pruebas',
      whatsapp: '+593999888777',
      email: 'pruebas@otterlyclean.ec',
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const publico = await request(app).get('/api/catalog/company');
    expect(publico.body.company.name).toBe('Otterly Clean Pruebas');
    expect(publico.body.company.whatsapp).toBe('+593999888777');

    // Y tambien por el endpoint que consume el arranque del frontend.
    const config = await request(app).get('/api/catalog/config');
    expect(config.body.company.name).toBe('Otterly Clean Pruebas');

    const log = await db.any(
      "SELECT * FROM audit_log WHERE action = 'COMPANY_SETTINGS_UPDATED' ORDER BY created_at DESC LIMIT 1",
    );
    expect(log).toHaveLength(1);
  });

  it('valida el formato de los datos de contacto', async () => {
    const res = await asAdmin(request(app).patch('/api/operations/settings/company')).send({
      whatsapp: '099-no-es-e164',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------------

describe('Configuracion de servicios', () => {
  it('lista los tres tipos conocidos, ofrecidos o no', async () => {
    const res = await asAdmin(request(app).get('/api/operations/services'));

    expect(res.status).toBe(200);
    expect(res.body.services.map((s) => s.code).sort()).toEqual([
      'ALTERATION',
      'CLEANING',
      'LAUNDRY',
    ]);
  });

  it('no existe forma de crear un cuarto tipo de servicio', async () => {
    const post = await asAdmin(request(app).post('/api/operations/services')).send({
      code: 'GARDENING',
      displayName: 'Jardineria',
    });
    // No hay ruta de creacion: el tipo de servicio es codigo, no configuracion.
    expect([404, 405]).toContain(post.status);

    const patch = await asAdmin(request(app).patch('/api/operations/services/GARDENING')).send({
      active: true,
    });
    expect(patch.status).toBe(400);
  });

  it('un servicio desactivado no puede reservarse', async () => {
    await asAdmin(request(app).patch('/api/operations/services/CLEANING')).send({ active: false });

    // Desaparece del catalogo publico...
    const catalogo = await request(app).get('/api/catalog/services');
    expect(catalogo.body.services.map((s) => s.code)).not.toContain('CLEANING');

    // ...y el backend rechaza la reserva aunque se llame directo a la API.
    const reserva = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: created.addressId,
        scheduledDate: futureDate(5),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 120 },
        cleaning: { bedrooms: 1, bathrooms: 1 },
      });

    expect(reserva.status).toBe(400);
    expect(reserva.body.error.code).toBe('SERVICE_NOT_ACTIVE');

    // Reactivar deja todo como estaba: no es un cambio irreversible.
    await asAdmin(request(app).patch('/api/operations/services/CLEANING')).send({ active: true });

    const despues = await request(app).get('/api/catalog/services');
    expect(despues.body.services.map((s) => s.code)).toContain('CLEANING');
  });

  it('desactivar un servicio no toca los pedidos que ya existian', async () => {
    const pedido = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: created.addressId,
        scheduledDate: futureDate(6),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 120 },
        cleaning: { bedrooms: 1, bathrooms: 1 },
      });
    expect(pedido.status, JSON.stringify(pedido.body)).toBe(201);

    await asAdmin(request(app).patch('/api/operations/services/CLEANING')).send({ active: false });

    const detalle = await request(app)
      .get(`/api/customer/orders/${pedido.body.order.id}`)
      .set('Authorization', `Bearer ${auth.customer}`);

    expect(detalle.status).toBe(200);
    expect(detalle.body.order.status).toBe('REQUESTED');

    await asAdmin(request(app).patch('/api/operations/services/CLEANING')).send({ active: true });
  });

  it('el precio que fija ADMIN es el que se usa realmente al cotizar', async () => {
    // $11.00/hora con minimo de 2 -> $20.00/hora con minimo de 3.
    const update = await asAdmin(
      request(app).patch(`/api/operations/services/CLEANING/plans/${created.cleaningPlanId}`),
    ).send({ baseAmount: 2000, config: { minimumHours: 3 } });

    expect(update.status, JSON.stringify(update.body)).toBe(200);
    expect(update.body.plan.base_amount).toBe(2000);

    const cotizacion = await request(app)
      .post('/api/customer/quote')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ planId: created.cleaningPlanId, pricingInput: { durationMinutes: 240 } });

    // 4 h x $20.00 = $80.00 + IVA 15% = $92.00
    expect(cotizacion.body.pricing.subtotal).toBe(8000);
    expect(cotizacion.body.pricing.total).toBe(9200);

    // Y el minimo nuevo tambien se aplica: 1 hora pedida, 3 facturadas.
    const minima = await request(app)
      .post('/api/customer/quote')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ planId: created.cleaningPlanId, pricingInput: { durationMinutes: 60 } });
    expect(minima.body.pricing.subtotal).toBe(6000);

    const log = await db.any(
      "SELECT * FROM audit_log WHERE action = 'SERVICE_PLAN_UPDATED' AND entity_id = $1",
      [String(created.cleaningPlanId)],
    );
    expect(log.length).toBeGreaterThan(0);
  });

  it('el precio se calcula en el backend, no se acepta del cliente', async () => {
    const res = await request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: created.addressId,
        scheduledDate: futureDate(7),
        windowCode: 'MORNING',
        pricingInput: { durationMinutes: 240 },
        // Intento de imponer el total: debe ignorarse por completo.
        totalAmount: 1,
        subtotalAmount: 1,
        cleaning: { bedrooms: 1, bathrooms: 1 },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const guardado = await db.one('SELECT subtotal_amount, total_amount FROM orders WHERE id = $1', [
      res.body.order.id,
    ]);
    expect(guardado.subtotal_amount).toBe(8000);
    expect(guardado.total_amount).toBe(9200);
  });

  it('descarta parametros de precio que no pertenecen al modelo', async () => {
    const res = await asAdmin(
      request(app).patch(`/api/operations/services/CLEANING/plans/${created.cleaningPlanId}`),
    ).send({ baseAmount: 2000, config: { minimumHours: 3, tiers: { '2BR': 99999 } } });

    expect(res.status).toBe(200);
    // `tiers` es de FLAT_BY_SIZE: un plan PER_HOUR no debe guardarlo.
    expect(res.body.plan.config.tiers).toBeUndefined();
    expect(res.body.plan.config.minimumHours).toBe(3);
  });

  it('rechaza parametros de precio fuera de rango', async () => {
    const res = await asAdmin(
      request(app).patch(`/api/operations/services/CLEANING/plans/${created.cleaningPlanId}`),
    ).send({ config: { minimumHours: 999 } });

    expect(res.status).toBe(400);
  });

  it('no permite cambiar el modelo de precio desde la pantalla', async () => {
    const res = await asAdmin(
      request(app).patch(`/api/operations/services/CLEANING/plans/${created.cleaningPlanId}`),
    ).send({ pricingModel: 'FIXED' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Disponibilidad
// ---------------------------------------------------------------------------

describe('Bloqueos de agenda', () => {
  /** Reserva de limpieza en la fecha y franja indicadas. */
  const reservar = (scheduledDate, windowCode = 'MORNING') =>
    request(app)
      .post('/api/customer/orders/cleaning')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.cleaningPlanId,
        addressId: created.addressId,
        scheduledDate,
        windowCode,
        pricingInput: { durationMinutes: 120 },
        cleaning: { bedrooms: 1, bathrooms: 1 },
      });

  async function crearBloqueo(payload) {
    const res = await asAdmin(request(app).post('/api/operations/booking-blackouts')).send(payload);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    created.blackoutIds.push(res.body.blackout.id);
    return res.body.blackout;
  }

  it('una reserva dentro de un bloqueo global es rechazada', async () => {
    const fecha = futureDate(10);
    await crearBloqueo({ startsAt: fecha, allDay: true, reason: 'Feriado de prueba' });

    const res = await reservar(fecha);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BOOKING_BLOCKED');
    expect(res.body.error.message).toMatch(/Feriado de prueba/);
  });

  it('fuera del bloqueo la reserva funciona con normalidad', async () => {
    const res = await reservar(futureDate(11));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('un bloqueo global afecta a todos los servicios', async () => {
    const fecha = futureDate(12);
    await crearBloqueo({ startsAt: fecha, allDay: true, reason: 'Cierre general' });

    const limpieza = await reservar(fecha);
    const lavanderia = await request(app)
      .post('/api/customer/orders/laundry')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.laundryPlanId,
        addressId: created.addressId,
        scheduledDate: fecha,
        windowCode: 'AFTERNOON',
        pricingInput: { estimatedWeight: 6 },
        laundry: {},
      });

    expect(limpieza.body.error.code).toBe('BOOKING_BLOCKED');
    expect(lavanderia.body.error.code).toBe('BOOKING_BLOCKED');
  });

  it('un bloqueo de un servicio no bloquea el otro', async () => {
    const fecha = futureDate(13);
    await crearBloqueo({
      serviceType: 'CLEANING',
      startsAt: fecha,
      allDay: true,
      reason: 'Solo limpieza',
    });

    const limpieza = await reservar(fecha);
    expect(limpieza.status).toBe(400);
    expect(limpieza.body.error.code).toBe('BOOKING_BLOCKED');

    const lavanderia = await request(app)
      .post('/api/customer/orders/laundry')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        planId: created.laundryPlanId,
        addressId: created.addressId,
        scheduledDate: fecha,
        windowCode: 'AFTERNOON',
        pricingInput: { estimatedWeight: 6 },
        laundry: {},
      });

    expect(lavanderia.status, JSON.stringify(lavanderia.body)).toBe(201);
  });

  it('un bloqueo por horas solo cierra las franjas que solapa', async () => {
    const fecha = futureDate(14);
    await crearBloqueo({
      startsAt: `${fecha}T13:00`,
      endsAt: `${fecha}T17:00`,
      reason: 'Mantenimiento',
    });

    const tarde = await reservar(fecha, 'AFTERNOON');
    expect(tarde.status).toBe(400);
    expect(tarde.body.error.code).toBe('BOOKING_BLOCKED');

    // La manana termina a las 12:00 y el bloqueo empieza a las 13:00.
    const manana = await reservar(fecha, 'MORNING');
    expect(manana.status, JSON.stringify(manana.body)).toBe(201);
  });

  it('los pedidos que ya existian no se cancelan al crear un bloqueo', async () => {
    const fecha = futureDate(15);

    const pedido = await reservar(fecha);
    expect(pedido.status, JSON.stringify(pedido.body)).toBe(201);

    await crearBloqueo({ startsAt: fecha, allDay: true, reason: 'Cierre posterior' });

    const detalle = await request(app)
      .get(`/api/customer/orders/${pedido.body.order.id}`)
      .set('Authorization', `Bearer ${auth.customer}`);

    // Sigue vivo y con la misma fecha: bloquear cierra reservas nuevas, no
    // rompe compromisos ya adquiridos con el cliente.
    expect(detalle.body.order.status).toBe('REQUESTED');
    expect(String(detalle.body.order.scheduledDate).slice(0, 10)).toBe(fecha);

    // Pero una reserva nueva ese dia ya no entra.
    const nueva = await reservar(fecha, 'AFTERNOON');
    expect(nueva.status).toBe(400);
  });

  it('desactivar el bloqueo vuelve a abrir la agenda', async () => {
    const fecha = futureDate(16);
    const blackout = await crearBloqueo({ startsAt: fecha, allDay: true, reason: 'Temporal' });

    expect((await reservar(fecha)).status).toBe(400);

    const patch = await asAdmin(
      request(app).patch(`/api/operations/booking-blackouts/${blackout.id}`),
    ).send({ active: false });
    expect(patch.status).toBe(200);

    expect((await reservar(fecha)).status).toBe(201);
  });

  it('eliminar el bloqueo tambien reabre la agenda y queda auditado', async () => {
    const fecha = futureDate(17);
    const blackout = await crearBloqueo({ startsAt: fecha, allDay: true, reason: 'Se elimina' });

    expect((await reservar(fecha)).status).toBe(400);

    const del = await asAdmin(
      request(app).delete(`/api/operations/booking-blackouts/${blackout.id}`),
    );
    expect(del.status).toBe(204);

    expect((await reservar(fecha)).status).toBe(201);

    const log = await db.any(
      "SELECT * FROM audit_log WHERE action = 'BOOKING_BLACKOUT_DELETED' AND entity_id = $1",
      [String(blackout.id)],
    );
    expect(log).toHaveLength(1);
  });

  it('el calendario publico refleja los bloqueos para no ofrecer horarios cerrados', async () => {
    const fecha = futureDate(18);
    await crearBloqueo({
      startsAt: `${fecha}T13:00`,
      endsAt: `${fecha}T17:00`,
      reason: 'Cerrado por la tarde',
    });

    const res = await request(app).get(
      `/api/catalog/availability?serviceType=CLEANING&from=${fecha}&to=${fecha}`,
    );

    expect(res.status).toBe(200);
    const dia = res.body.days.find((d) => d.date === fecha);
    const franjas = Object.fromEntries(dia.windows.map((w) => [w.code, w]));

    expect(franjas.AFTERNOON.available).toBe(false);
    expect(franjas.AFTERNOON.reason).toBe('Cerrado por la tarde');
    expect(franjas.MORNING.available).toBe(true);
    expect(dia.fullyBlocked).toBe(false);
  });

  it('la agenda sigue abierta para el resto de fechas futuras', async () => {
    const hoy = localDate(new Date());
    await crearBloqueo({ startsAt: hoy, allDay: true, reason: 'Hoy cerrado' });

    const res = await request(app).get('/api/catalog/availability?serviceType=CLEANING');
    const abiertos = res.body.days.filter((day) => !day.fullyBlocked);

    // Cerrar hoy no puede dejar al cliente sin poder agendar nada.
    expect(abiertos.length).toBeGreaterThan(20);
  });

  it('permite mover solo uno de los dos extremos del bloqueo', async () => {
    const fecha = futureDate(19);
    const blackout = await crearBloqueo({ startsAt: fecha, allDay: true, reason: 'Se acorta' });

    // El extremo que no se toca vuelve de la base como Date, no como cadena.
    const patch = await asAdmin(
      request(app).patch(`/api/operations/booking-blackouts/${blackout.id}`),
    ).send({ startsAt: `${fecha}T13:00` });

    expect(patch.status, JSON.stringify(patch.body)).toBe(200);

    // La manana queda libre; la tarde sigue cerrada.
    expect((await reservar(fecha, 'MORNING')).status).toBe(201);
    expect((await reservar(fecha, 'AFTERNOON')).status).toBe(400);
  });

  it('rechaza un rango invalido', async () => {
    const res = await asAdmin(request(app).post('/api/operations/booking-blackouts')).send({
      startsAt: `${futureDate(20)}T17:00`,
      endsAt: `${futureDate(20)}T14:00`,
    });

    expect(res.status).toBe(400);
  });
});
