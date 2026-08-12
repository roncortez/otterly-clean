'use strict';

/**
 * Invitacion y activacion de una cuenta de trabajador.
 *
 * Es el camino por el que entra alguien nuevo a la empresa, asi que se prueba
 * completo: quien puede invitar, que hace un enlace caducado, que pasa si se
 * intenta usar dos veces y que un enlace nuevo deja inservible al anterior.
 *
 * Corre contra la base de datos real, igual que el resto de pruebas de flujo.
 */

const request = require('supertest');
const { createApp } = require('../src/http/app');
const { db, pgp } = require('../src/db');
const { hashToken } = require('../src/services/crypto');

const app = createApp();

const stamp = Date.now();
const auth = {};
const created = { userIds: [] };

/** Extrae el token del enlace de activacion que devuelve la invitacion. */
function tokenFrom(activationUrl) {
  return new URL(activationUrl).searchParams.get('token');
}

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, `login ${email}: ${JSON.stringify(res.body)}`).toBe(200);
  return res.body;
}

function newStaffPayload(suffix) {
  return {
    email: `test.invitacion.${stamp}.${suffix}@ejemplo.com`,
    firstName: 'Invitada',
    lastName: 'Prueba',
    phone: '+593991234500',
    serviceTypes: ['CLEANING'],
  };
}

async function createStaff(suffix) {
  const res = await request(app)
    .post('/api/operations/staff')
    .set('Authorization', `Bearer ${auth.admin}`)
    .send(newStaffPayload(suffix));

  expect(res.status, JSON.stringify(res.body)).toBe(201);
  created.userIds.push(res.body.staff.id);
  return res.body;
}

beforeAll(async () => {
  auth.admin = (await login('admin@otterlyclean.ec', 'Admin123!')).accessToken;
  auth.staff = (await login('carla.mendez@otterlyclean.ec', 'Staff123!')).accessToken;

  const customer = await request(app)
    .post('/api/auth/register')
    .send({
      email: `test.invitacion.cliente.${stamp}@ejemplo.com`,
      password: 'Cliente123!',
      firstName: 'Cliente',
      lastName: 'Prueba',
    });
  auth.customer = customer.body.accessToken;
  created.userIds.push(customer.body.user.id);
}, 30000);

afterAll(async () => {
  if (created.userIds.length > 0) {
    await db.none('DELETE FROM users WHERE id = ANY($1)', [created.userIds]);
  }
  await pgp.end();
});

describe('Quien puede invitar', () => {
  it('ADMIN crea al trabajador y el sistema emite la invitacion', async () => {
    const body = await createStaff('admin');

    expect(body.staff.email).toContain('test.invitacion');
    expect(body.invitation.status).toBe('PENDING');
    expect(body.activationUrl).toContain('/activar-cuenta?token=');
    // Se crea sin verificar: verificarlo es una decision aparte.
    expect(body.staff.verification_status).toBe('PENDING');
  });

  it('la respuesta no filtra el hash del token', async () => {
    const body = await createStaff('sin-hash');
    const serialized = JSON.stringify(body.invitation);

    expect(serialized).not.toContain('token_hash');
    expect(serialized).not.toContain('tokenHash');
  });

  it('la base guarda el hash, nunca el token', async () => {
    const body = await createStaff('hash-en-base');
    const token = tokenFrom(body.activationUrl);

    const rows = await db.any('SELECT token_hash FROM user_invitations WHERE user_id = $1', [
      body.staff.id,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toBe(hashToken(token));
  });

  it('un STAFF no puede invitar', async () => {
    const res = await request(app)
      .post('/api/operations/staff')
      .set('Authorization', `Bearer ${auth.staff}`)
      .send(newStaffPayload('staff'));

    expect(res.status).toBe(403);
  });

  it('un CUSTOMER tampoco', async () => {
    const res = await request(app)
      .post('/api/operations/staff')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send(newStaffPayload('customer'));

    expect(res.status).toBe(403);
  });

  it('sin sesion, menos todavia', async () => {
    const res = await request(app).post('/api/operations/staff').send(newStaffPayload('anon'));
    expect(res.status).toBe(401);
  });

  it('el ADMIN no puede fijar la contrasena del trabajador', async () => {
    const res = await request(app)
      .post('/api/operations/staff')
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ ...newStaffPayload('con-clave'), password: 'LaQueYoQuiera1!' });

    // El esquema no conoce `password`: no es que lo ignore, es que lo rechaza.
    expect(res.status).toBe(400);
  });

  it('la cuenta recien creada no puede entrar todavia', async () => {
    const body = await createStaff('sin-clave');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: body.staff.email, password: 'Staff123!' });

    expect(res.status).toBe(401);
  });
});

describe('Uso del enlace', () => {
  it('un token valido permite activar la cuenta y deja la sesion abierta', async () => {
    const body = await createStaff('activa');
    const token = tokenFrom(body.activationUrl);

    const check = await request(app).get(`/api/auth/invitations/${token}`);
    expect(check.status, JSON.stringify(check.body)).toBe(200);
    expect(check.body.invitation.firstName).toBe('Invitada');

    const accepted = await request(app)
      .post(`/api/auth/invitations/${token}/accept`)
      .send({ password: 'MiClaveNueva1!' });

    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.accessToken).toBeTruthy();
    expect(accepted.body.user.roles).toContain('STAFF');
    // Entra directamente a completar su perfil.
    expect(accepted.body.user.onboarding.pending).toBe(true);
    expect(accepted.body.user.onboarding.scope).toBe('STAFF');

    // Y a partir de ahora entra con la clave que eligio.
    const session = await login(body.staff.email, 'MiClaveNueva1!');
    expect(session.user.id).toBe(body.staff.id);
  });

  it('un token ya usado no sirve una segunda vez', async () => {
    const body = await createStaff('reuso');
    const token = tokenFrom(body.activationUrl);

    const first = await request(app)
      .post(`/api/auth/invitations/${token}/accept`)
      .send({ password: 'PrimeraClave1!' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/auth/invitations/${token}/accept`)
      .send({ password: 'OtraClave1!' });
    expect(second.status).toBe(404);

    // Y la contrasena sigue siendo la que puso su dueno.
    const session = await login(body.staff.email, 'PrimeraClave1!');
    expect(session.user.id).toBe(body.staff.id);
  });

  it('un token vencido falla', async () => {
    const body = await createStaff('vencida');
    const token = tokenFrom(body.activationUrl);

    await db.none('UPDATE user_invitations SET expires_at = NOW() - INTERVAL $1 WHERE user_id = $2', [
      '1 hour',
      body.staff.id,
    ]);

    const check = await request(app).get(`/api/auth/invitations/${token}`);
    expect(check.status).toBe(404);

    const accepted = await request(app)
      .post(`/api/auth/invitations/${token}/accept`)
      .send({ password: 'YaNoLlego1!' });
    expect(accepted.status).toBe(404);
  });

  it('un token inventado responde igual que uno vencido', async () => {
    const res = await request(app).get(`/api/auth/invitations/${'a'.repeat(64)}`);
    expect(res.status).toBe(404);
  });

  it('reenviar la invitacion invalida la anterior', async () => {
    const body = await createStaff('reenvio');
    const primerToken = tokenFrom(body.activationUrl);

    const reenviada = await request(app)
      .post(`/api/operations/staff/${body.staff.id}/invite`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send();

    expect(reenviada.status, JSON.stringify(reenviada.body)).toBe(201);
    const segundoToken = tokenFrom(reenviada.body.activationUrl);
    expect(segundoToken).not.toBe(primerToken);

    // El enlace viejo deja de abrir la cuenta...
    const viejo = await request(app)
      .post(`/api/auth/invitations/${primerToken}/accept`)
      .send({ password: 'ConElViejo1!' });
    expect(viejo.status).toBe(404);

    // ...y el nuevo funciona.
    const nuevo = await request(app)
      .post(`/api/auth/invitations/${segundoToken}/accept`)
      .send({ password: 'ConElNuevo1!' });
    expect(nuevo.status, JSON.stringify(nuevo.body)).toBe(200);
  });

  it('una cuenta creada inactiva no se activa sola al aceptar', async () => {
    const create = await request(app)
      .post('/api/operations/staff')
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ ...newStaffPayload('inactiva'), active: false });

    expect(create.status, JSON.stringify(create.body)).toBe(201);
    created.userIds.push(create.body.staff.id);

    const res = await request(app)
      .post(`/api/auth/invitations/${tokenFrom(create.body.activationUrl)}/accept`)
      .send({ password: 'NoDeberiaEntrar1!' });

    // El estado de la cuenta lo decide Operaciones, no quien acepta.
    expect(res.status).toBe(403);

    const user = await db.one('SELECT status FROM users WHERE id = $1', [create.body.staff.id]);
    expect(user.status).toBe('INACTIVE');

    // Y el enlace sigue sirviendo para cuando la empresa la habilite.
    const invitation = await db.one(
      'SELECT accepted_at FROM user_invitations WHERE user_id = $1',
      [create.body.staff.id],
    );
    expect(invitation.accepted_at).toBeNull();
  });

  it('la contrasena elegida tiene que ser aceptable', async () => {
    const body = await createStaff('clave-corta');
    const token = tokenFrom(body.activationUrl);

    const res = await request(app)
      .post(`/api/auth/invitations/${token}/accept`)
      .send({ password: '123' });

    expect(res.status).toBe(400);
  });
});

describe('WhatsApp y correo', () => {
  it('no se marca como enviado lo que ningun proveedor entrego', async () => {
    const body = await createStaff('entrega');

    // Se intenta por los dos canales que pide el negocio...
    const canales = body.delivery.map((entry) => entry.channel);
    expect(canales).toContain('WHATSAPP');
    expect(canales).toContain('EMAIL');

    // ...y mientras no exista proveedor, ninguno miente diciendo SENT.
    for (const entry of body.delivery) {
      expect(entry.status).toBe('PENDING');
      expect(entry.reason).toMatch(/NOT_CONFIGURED/);
    }

    const rows = await db.any(
      "SELECT status, error, body FROM notifications WHERE user_id = $1 AND event = 'STAFF_INVITED'",
      [body.staff.id],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.status).toBe('PENDING');
      // El enlace no se guarda: lleva un token que abre la cuenta.
      expect(row.body).not.toContain('activar-cuenta');
      expect(row.body).not.toContain('token=');
    }
  });
});

describe('La sesion sigue funcionando igual', () => {
  it('login, refresh y logout', async () => {
    const session = await login('cliente@ejemplo.com', 'Cliente123!');
    expect(session.user.roles).toContain('CUSTOMER');

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    // El refresh rota: el token anterior ya no vale.
    const reused = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(reused.status).toBe(401);

    const loggedOut = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: refreshed.body.refreshToken });
    expect(loggedOut.status).toBe(204);

    const afterLogout = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it('las rutas protegidas siguen exigiendo su rol', async () => {
    expect((await request(app).get('/api/customer/addresses')).status).toBe(401);

    const sinRol = await request(app)
      .get('/api/operations/dashboard')
      .set('Authorization', `Bearer ${auth.customer}`);
    expect(sinRol.status).toBe(403);

    const conRol = await request(app)
      .get('/api/operations/dashboard')
      .set('Authorization', `Bearer ${auth.admin}`);
    expect(conRol.status).toBe(200);
  });

  it('el login responde tambien el estado del onboarding', async () => {
    const session = await login('admin@otterlyclean.ec', 'Admin123!');
    // Quien solo administra no tiene perfil que completar.
    expect(session.user.onboarding).toEqual({ pending: false, scope: null });
  });
});
