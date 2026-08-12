'use strict';

/**
 * Subida de imagenes publicas.
 *
 * Las comprobaciones que no dependen de la red corren siempre. Las que suben de
 * verdad a Cloudinary solo corren si hay credenciales configuradas, para que
 * `npm test` siga funcionando en un entorno que no las tenga.
 */

const request = require('supertest');
const { createApp } = require('../src/http/app');
const { db, pgp } = require('../src/db');
const uploadService = require('../src/services/uploadService');

const app = createApp();

const stamp = Date.now();
const auth = {};
const created = {};

/** PNG 1x1 real: pasa la comprobacion de firma binaria. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

beforeAll(async () => {
  const admin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@otterlyclean.ec', password: 'Admin123!' });
  auth.admin = admin.body.accessToken;

  const staff = await request(app)
    .post('/api/auth/login')
    .send({ email: 'carla.mendez@otterlyclean.ec', password: 'Staff123!' });
  auth.staff = staff.body.accessToken;

  const customer = await request(app).post('/api/auth/register').send({
    email: `test.upload.${stamp}@ejemplo.com`,
    password: 'Cliente123!',
    firstName: 'Subida',
    lastName: 'Cliente',
  });
  auth.customer = customer.body.accessToken;
  created.customerId = customer.body.user.id;
}, 30000);

afterAll(async () => {
  if (created.customerId) {
    await db.none('DELETE FROM users WHERE id = $1', [created.customerId]);
  }
  await pgp.end();
});

describe('Catalogo de destinos', () => {
  it('es cerrado: la ruta de destino nunca viene de la peticion', () => {
    // Si alguno de estos apareciera, la carpeta seria un dato de entrada.
    for (const code of uploadService.SLOT_CODES) {
      expect(code).toMatch(/^[A-Z_]+$/);
    }
    expect(uploadService.SLOT_CODES).toEqual(
      expect.arrayContaining([
        'COMPANY_LOGO',
        'COMPANY_ICON',
        'BANNER',
        'SERVICE_CLEANING',
        'SERVICE_LAUNDRY',
        'SERVICE_ALTERATION',
      ]),
    );
  });

  it('cada destino tiene una ruta fija, para no dejar copias huerfanas', () => {
    const rutas = uploadService.SLOT_CODES.map((code) => {
      const slot = uploadService.SLOTS[code];
      return `${slot.folder}/${slot.publicId}`;
    });

    // Ninguna carpeta suelta en la raiz y ningun destino repetido.
    expect(new Set(rutas).size).toBe(rutas.length);
    for (const ruta of rutas) expect(ruta).toMatch(/^[a-z]+\/[a-z-]+$/);
  });
});

describe('Validacion del archivo', () => {
  it('reconoce PNG, JPG y WebP por su firma binaria', () => {
    expect(uploadService.detectFormat(PNG).format).toBe('png');

    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(12)]);
    expect(uploadService.detectFormat(jpg).format).toBe('jpg');

    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBP'),
      Buffer.alloc(4),
    ]);
    expect(uploadService.detectFormat(webp).format).toBe('webp');
  });

  it('rechaza un archivo que dice ser imagen y no lo es', () => {
    // Un SVG con script, renombrado a .png y enviado como image/png.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    expect(uploadService.detectFormat(svg)).toBeNull();

    expect(uploadService.detectFormat(Buffer.from('#!/bin/sh\nrm -rf /'))).toBeNull();
    expect(uploadService.detectFormat(Buffer.alloc(0))).toBeNull();
  });
});

describe('Control de acceso a la subida', () => {
  it('sin sesion no se puede subir', async () => {
    const res = await request(app)
      .post('/api/operations/uploads/COMPANY_LOGO')
      .attach('image', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('un CUSTOMER no puede subir', async () => {
    const res = await request(app)
      .post('/api/operations/uploads/COMPANY_LOGO')
      .set('Authorization', `Bearer ${auth.customer}`)
      .attach('image', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('un STAFF tampoco', async () => {
    const res = await request(app)
      .post('/api/operations/uploads/COMPANY_LOGO')
      .set('Authorization', `Bearer ${auth.staff}`)
      .attach('image', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('rechaza un destino que no esta en el catalogo', async () => {
    const res = await request(app)
      .post('/api/operations/uploads/SECRETOS')
      .set('Authorization', `Bearer ${auth.admin}`)
      .attach('image', PNG, { filename: 'logo.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza contenido que no es una imagen aunque lo declare como PNG', async () => {
    const res = await request(app)
      .post('/api/operations/uploads/COMPANY_LOGO')
      .set('Authorization', `Bearer ${auth.admin}`)
      .attach('image', Buffer.from('<svg onload="alert(1)"></svg>'), {
        filename: 'logo.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.issues?.[0]?.message ?? res.body.error.message).toMatch(/PNG|imagen/i);
  });

  it('rechaza un formato no admitido por su tipo declarado', async () => {
    const res = await request(app)
      .post('/api/operations/uploads/COMPANY_LOGO')
      .set('Authorization', `Bearer ${auth.admin}`)
      .attach('image', Buffer.from('GIF89a'), {
        filename: 'logo.gif',
        contentType: 'image/gif',
      });

    expect(res.status).toBe(400);
  });
});

/**
 * Pruebas que salen a la red. Solo corren con credenciales configuradas: sin
 * ellas la aplicacion funciona igual, con el campo de URL.
 */
describe.runIf(uploadService.isEnabled())('Subida real a Cloudinary', () => {
  it('guarda la imagen dentro de su carpeta, no suelta en la raiz', async () => {
    const res = await request(app)
      .post('/api/operations/uploads/SERVICE_CLEANING')
      .set('Authorization', `Bearer ${auth.admin}`)
      // Nombre malicioso a proposito: no debe influir en la ruta final.
      .attach('image', PNG, { filename: '../../../evil.png', contentType: 'image/png' });

    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const { image } = res.body;
    expect(image.publicId).toBe('otterly-clean/servicios/cleaning');
    expect(image.publicId).not.toContain('..');
    expect(image.publicId).not.toContain('evil');
    expect(image.url).toMatch(/^https:\/\/res\.cloudinary\.com\//);

    created.uploadedUrl = image.url;
  }, 30000);

  it('reemplaza en lugar de acumular copias', async () => {
    const primera = await request(app)
      .post('/api/operations/uploads/SERVICE_CLEANING')
      .set('Authorization', `Bearer ${auth.admin}`)
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });

    const segunda = await request(app)
      .post('/api/operations/uploads/SERVICE_CLEANING')
      .set('Authorization', `Bearer ${auth.admin}`)
      .attach('image', PNG, { filename: 'b.png', contentType: 'image/png' });

    // Mismo destino: no se crea un archivo nuevo por cada subida.
    expect(segunda.body.image.publicId).toBe(primera.body.image.publicId);
  }, 30000);

  it('deja rastro en auditoria de quien subio que', async () => {
    const log = await db.any(
      "SELECT * FROM audit_log WHERE action = 'MEDIA_UPLOADED' ORDER BY created_at DESC LIMIT 1",
    );
    expect(log).toHaveLength(1);
    expect(log[0].after.slot).toBe('SERVICE_CLEANING');
  });

  it('permite quitar la imagen', async () => {
    const res = await request(app)
      .delete('/api/operations/uploads/SERVICE_CLEANING')
      .set('Authorization', `Bearer ${auth.admin}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.publicId).toBe('otterly-clean/servicios/cleaning');
  }, 30000);
});
