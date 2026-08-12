'use strict';

/**
 * Onboarding y perfil propio.
 *
 * Lo que se prueba aqui es sobre todo una frontera: que cada persona pueda
 * completar y corregir SUS datos, y que no pueda tocar los que tienen
 * consecuencias —roles, capacidades de servicio, verificacion, estado—, por
 * mucho que los envie en el cuerpo de la peticion.
 */

const request = require('supertest');
const { createApp } = require('../src/http/app');
const { db, pgp } = require('../src/db');
const uploadService = require('../src/services/uploadService');

const app = createApp();

const stamp = Date.now();
const auth = {};
const created = { userIds: [] };

/** PNG 1x1 real: pasa la comprobacion de firma binaria. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function tokenFrom(activationUrl) {
  return new URL(activationUrl).searchParams.get('token');
}

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, `login ${email}: ${JSON.stringify(res.body)}`).toBe(200);
  return res.body;
}

/** Crea un trabajador nuevo y lo activa con su invitacion. */
async function inviteAndActivate(suffix, overrides = {}) {
  const create = await request(app)
    .post('/api/operations/staff')
    .set('Authorization', `Bearer ${auth.admin}`)
    .send({
      email: `test.onboarding.${stamp}.${suffix}@ejemplo.com`,
      firstName: 'Nueva',
      lastName: 'Trabajadora',
      serviceTypes: ['CLEANING'],
      ...overrides,
    });

  expect(create.status, JSON.stringify(create.body)).toBe(201);
  created.userIds.push(create.body.staff.id);

  const accepted = await request(app)
    .post(`/api/auth/invitations/${tokenFrom(create.body.activationUrl)}/accept`)
    .send({ password: 'ClaveNueva123!' });

  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  return { staff: create.body.staff, session: accepted.body };
}

beforeAll(async () => {
  auth.admin = (await login('admin@otterlyclean.ec', 'Admin123!')).accessToken;

  const customer = await request(app).post('/api/auth/register').send({
    email: `test.onboarding.cliente.${stamp}@ejemplo.com`,
    password: 'Cliente123!',
    firstName: 'Cliente',
    lastName: 'Nuevo',
    phone: '+593991234501',
  });
  expect(customer.status, JSON.stringify(customer.body)).toBe(201);
  auth.customer = customer.body.accessToken;
  created.customerId = customer.body.user.id;
  created.customerSession = customer.body;
  created.userIds.push(customer.body.user.id);
}, 30000);

afterAll(async () => {
  if (created.userIds.length > 0) {
    await db.none('DELETE FROM addresses WHERE user_id = ANY($1)', [created.userIds]);
    await db.none('DELETE FROM users WHERE id = ANY($1)', [created.userIds]);
  }
  await pgp.end();
});

describe('Onboarding del trabajador', () => {
  it('un trabajador recien activado tiene onboarding pendiente', async () => {
    const { session } = await inviteAndActivate('pendiente');

    expect(session.user.onboarding).toEqual({ pending: true, scope: 'STAFF' });

    const state = await request(app)
      .get('/api/me/onboarding')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(state.status).toBe(200);
    expect(state.body.onboarding.scope).toBe('STAFF');
    expect(state.body.onboarding.steps.map((step) => step.code)).toEqual([
      'PERSONAL',
      'PROFESSIONAL',
      'PHOTO',
    ]);
    // Le faltan telefono, nombre publico y presentacion; el nombre ya lo puso
    // Operaciones al crearlo y no se le vuelve a preguntar.
    expect(state.body.onboarding.missing).toContain('phone');
    expect(state.body.onboarding.missing).toContain('bio');
    expect(state.body.onboarding.missing).not.toContain('firstName');
  });

  it('completa su perfil y a partir de ahi entra con normalidad', async () => {
    const { staff, session } = await inviteAndActivate('completa');
    const token = session.accessToken;

    const saved = await request(app)
      .patch('/api/me/onboarding')
      .set('Authorization', `Bearer ${token}`)
      .send({
        phone: '+593991234502',
        displayName: 'Nueva',
        bio: 'Cinco años limpiando casas en Quito.',
        skills: ['planchado'],
      });

    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.onboarding.missing).toEqual([]);

    const completed = await request(app)
      .post('/api/me/onboarding/complete')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect(completed.body.onboarding.pending).toBe(false);
    expect(completed.body.onboarding.scope).toBeNull();

    // La marca es persistente: no depende de la pantalla.
    const row = await db.one(
      'SELECT onboarding_completed_at, bio, display_name FROM staff_profiles WHERE user_id = $1',
      [staff.id],
    );
    expect(row.onboarding_completed_at).not.toBeNull();
    expect(row.bio).toContain('Quito');

    // Y en la siguiente sesion ya no se le manda a completar nada.
    const next = await login(staff.email, 'ClaveNueva123!');
    expect(next.user.onboarding.pending).toBe(false);
  });

  it('no se puede dar por completo lo que aun no esta completo', async () => {
    const { session } = await inviteAndActivate('incompleta');

    const res = await request(app)
      .post('/api/me/onboarding/complete')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send();

    expect(res.status).toBe(409);
    expect(res.body.error.missing).toContain('bio');
  });

  it('quien es ADMIN y STAFF hace el onboarding del trabajador', async () => {
    const { session } = await inviteAndActivate('dos-roles', { roles: ['ADMIN', 'STAFF'] });

    expect(session.user.roles).toEqual(expect.arrayContaining(['ADMIN', 'STAFF']));
    expect(session.user.onboarding.scope).toBe('STAFF');
  });

  it('quien solo administra no tiene onboarding', async () => {
    const state = await request(app)
      .get('/api/me/onboarding')
      .set('Authorization', `Bearer ${auth.admin}`);

    expect(state.status).toBe(200);
    expect(state.body.onboarding.pending).toBe(false);
    expect(state.body.onboarding.steps).toEqual([]);
  });
});

describe('Onboarding del cliente', () => {
  it('solo pregunta lo que falta', async () => {
    const state = await request(app)
      .get('/api/me/onboarding')
      .set('Authorization', `Bearer ${auth.customer}`);

    expect(state.status).toBe(200);
    expect(state.body.onboarding.scope).toBe('CUSTOMER');

    // Se registro con nombre y telefono: no se le vuelven a pedir.
    expect(state.body.onboarding.missing).not.toContain('phone');
    expect(state.body.onboarding.missing).not.toContain('firstName');
    // Le falta donde prestar el servicio.
    expect(state.body.onboarding.missing).toEqual(['address']);
    expect(state.body.onboarding.values.phone).toBe('+593991234501');
  });

  it('deja de estar pendiente cuando registra su direccion', async () => {
    const address = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({
        label: 'Casa',
        streetLine1: 'Av. Amazonas N34-120',
        city: 'Quito',
        administrativeArea: 'Pichincha',
        latitude: -0.1807,
        longitude: -78.4678,
      });

    expect(address.status, JSON.stringify(address.body)).toBe(201);

    const completed = await request(app)
      .post('/api/me/onboarding/complete')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send();

    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect(completed.body.onboarding.pending).toBe(false);
  });

  it('un cliente que se registra sin telefono si tiene que darlo', async () => {
    const registered = await request(app).post('/api/auth/register').send({
      email: `test.onboarding.sintel.${stamp}@ejemplo.com`,
      password: 'Cliente123!',
      firstName: 'Sin',
      lastName: 'Telefono',
    });
    expect(registered.status).toBe(201);
    created.userIds.push(registered.body.user.id);

    expect(registered.body.user.onboarding.pending).toBe(true);
    expect(registered.body.user.onboarding.scope).toBe('CUSTOMER');

    const state = await request(app)
      .get('/api/me/onboarding')
      .set('Authorization', `Bearer ${registered.body.accessToken}`);

    expect(state.body.onboarding.missing).toContain('phone');
  });
});

describe('Que puede cambiar cada quien', () => {
  it('un trabajador no puede darse roles desde su perfil', async () => {
    const { staff, session } = await inviteAndActivate('roles');

    const res = await request(app)
      .patch('/api/me/profile')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ bio: 'Intento colarme', roles: ['ADMIN'] });

    expect(res.status).toBe(400);

    const roles = await db.any('SELECT role FROM user_roles WHERE user_id = $1', [staff.id]);
    expect(roles.map((row) => row.role)).toEqual(['STAFF']);
  });

  it('tampoco puede ampliarse sus capacidades ni verificarse solo', async () => {
    const { staff, session } = await inviteAndActivate('capacidades');

    for (const payload of [
      { serviceTypes: ['CLEANING', 'LAUNDRY'] },
      { verificationStatus: 'VERIFIED' },
      { active: true },
      { employeeCode: 'EMP-999' },
    ]) {
      const res = await request(app)
        .patch('/api/me/profile')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send(payload);
      expect(res.status, JSON.stringify(payload)).toBe(400);
    }

    const profile = await db.one(
      'SELECT service_types, verification_status, employee_code FROM staff_profiles WHERE user_id = $1',
      [staff.id],
    );
    expect(profile.service_types).toEqual(['CLEANING']);
    expect(profile.verification_status).toBe('PENDING');
    expect(profile.employee_code).toBeNull();
  });

  it('un cliente no puede escribir campos de trabajador', async () => {
    const res = await request(app)
      .patch('/api/me/profile')
      .set('Authorization', `Bearer ${auth.customer}`)
      .send({ bio: 'No soy trabajador' });

    // El campo existe en el esquema pero no esta a su alcance: 403, no 400.
    expect(res.status).toBe(403);
  });

  it('el ADMIN sigue controlando capacidades, verificacion y estado', async () => {
    const { staff } = await inviteAndActivate('admin-manda');

    const updated = await request(app)
      .patch(`/api/operations/staff/${staff.id}`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ serviceTypes: ['CLEANING', 'LAUNDRY'], employeeCode: 'EMP-777' });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.staff.service_types).toEqual(['CLEANING', 'LAUNDRY']);

    const verified = await request(app)
      .post(`/api/operations/staff/${staff.id}/verification`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ status: 'VERIFIED' });
    expect(verified.status).toBe(200);
    expect(verified.body.staff.verification_status).toBe('VERIFIED');
  });

  it('el ADMIN ya no escribe la presentacion del trabajador', async () => {
    const { staff } = await inviteAndActivate('admin-no-bio');

    const res = await request(app)
      .patch(`/api/operations/staff/${staff.id}`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .send({ bio: 'Se lo escribo yo' });

    expect(res.status).toBe(400);
  });

  it('el perfil propio devuelve lo administrativo como lectura', async () => {
    const { session } = await inviteAndActivate('lectura');

    const res = await request(app)
      .get('/api/me/profile')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.profile.staff.serviceTypes).toEqual(['CLEANING']);
    expect(res.body.profile.staff.verificationStatus).toBe('PENDING');
    expect(res.body.profile.customer).toBeNull();
  });
});

describe('Foto de perfil', () => {
  it('sin sesion no se puede subir', async () => {
    const res = await request(app)
      .post('/api/me/photo')
      .attach('image', PNG, { filename: 'foto.png', contentType: 'image/png' });

    expect(res.status).toBe(401);
  });

  it('rechaza lo que no es una imagen aunque diga que lo es', async () => {
    const { session } = await inviteAndActivate('foto-mala');

    const res = await request(app)
      .post('/api/me/photo')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .attach('image', Buffer.from('<svg onload="alert(1)"></svg>'), {
        filename: 'foto.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
  });

  it('rechaza un formato no admitido', async () => {
    const { session } = await inviteAndActivate('foto-gif');

    const res = await request(app)
      .post('/api/me/photo')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .attach('image', Buffer.from('GIF89a'), {
        filename: 'foto.gif',
        contentType: 'image/gif',
      });

    expect(res.status).toBe(400);
  });

  it('no existe forma de tocar la foto de otra persona', async () => {
    // La ruta no acepta ningun identificador: el sujeto es siempre la sesion.
    const otra = await request(app)
      .post(`/api/me/photo/${created.customerId}`)
      .set('Authorization', `Bearer ${auth.admin}`)
      .attach('image', PNG, { filename: 'foto.png', contentType: 'image/png' });

    expect(otra.status).toBe(404);
  });
});

/**
 * La subida real solo corre con credenciales configuradas, igual que el resto
 * de pruebas de almacenamiento: sin ellas la aplicacion funciona y `npm test`
 * tambien.
 */
describe.runIf(uploadService.isEnabled())('Foto de perfil con almacenamiento real', () => {
  it('se guarda la referencia, no la imagen, y el cliente la ve', async () => {
    const { staff, session } = await inviteAndActivate('foto-real');

    const uploaded = await request(app)
      .post('/api/me/photo')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .attach('image', PNG, { filename: '../../evil.png', contentType: 'image/png' });

    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    expect(uploaded.body.photoUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);

    const row = await db.one(
      'SELECT photo_url, photo_public_id FROM staff_profiles WHERE user_id = $1',
      [staff.id],
    );
    // La base guarda referencias, nunca la imagen.
    expect(row.photo_url).toBe(uploaded.body.photoUrl);
    expect(row.photo_public_id).toContain('perfiles/usuario-');
    expect(row.photo_public_id).not.toContain('evil');
    expect(row.photo_public_id).not.toContain('..');

    // Es la misma columna que ve el cliente del profesional asignado.
    const publicProfile = await db.one(
      'SELECT photo_url FROM staff_profiles WHERE user_id = $1',
      [staff.id],
    );
    expect(publicProfile.photo_url).toBeTruthy();

    const removed = await request(app)
      .delete('/api/me/photo')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(removed.status).toBe(200);
    expect(removed.body.photoUrl).toBeNull();
  }, 30000);
});
