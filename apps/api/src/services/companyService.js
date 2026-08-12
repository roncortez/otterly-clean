'use strict';

const { db } = require('../db');
const settingsRepo = require('../db/repositories/settingsRepository');
const audit = require('./auditService');

/**
 * Datos publicos de la empresa.
 *
 * Antes vivian escritos a mano en el frontend (nombre, telefono, WhatsApp...).
 * Ahora son datos, para que Operaciones pueda cambiar un numero de contacto sin
 * tocar codigo ni desplegar.
 *
 * IMPORTANTE: aqui solo entra informacion que YA es publica porque se muestra
 * en la web. Nada de secretos, tokens ni credenciales: eso vive en variables de
 * entorno y no debe poder editarse desde una pantalla. Ver docs/SECURITY.md.
 */

const SETTINGS_KEY = 'company';

/**
 * Valores de respaldo. Existen para que la aplicacion arranque aunque la fila
 * de configuracion no este (base a medio migrar, entorno recien creado), en
 * lugar de renderizar huecos vacios.
 */
const DEFAULTS = Object.freeze({
  name: 'Otterly Clean',
  tagline: '',
  logoUrl: '',
  iconUrl: '',
  phone: '',
  whatsapp: '',
  whatsappMessage: '',
  telegram: '',
  email: '',
  address: '',
  website: '',
  instagram: '',
  facebook: '',
  supportHours: '',
});

const FIELDS = Object.keys(DEFAULTS);

/** Configuracion completa, con los valores por defecto rellenados. */
async function get() {
  const stored = (await settingsRepo.getSetting(SETTINGS_KEY)) ?? {};
  return { ...DEFAULTS, ...stored };
}

/**
 * Lo que se sirve al frontend publico.
 *
 * Hoy coincide con `get()` porque toda esta configuracion es publica por
 * definicion. La funcion existe igualmente como punto unico donde recortar la
 * respuesta el dia que se anada un campo interno, para que no se filtre por
 * olvido.
 */
async function getPublic() {
  const company = await get();
  return Object.fromEntries(FIELDS.map((field) => [field, company[field]]));
}

/**
 * Actualizacion parcial: solo se tocan los campos enviados. El payload ya viene
 * validado con Zod desde la capa http.
 */
async function update({ payload, actor, request }) {
  const before = await get();
  const after = { ...before };

  for (const field of FIELDS) {
    if (payload[field] !== undefined) after[field] = payload[field];
  }

  return db.tx(async (tx) => {
    await settingsRepo.setSetting(SETTINGS_KEY, after, tx);

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.COMPANY_SETTINGS_UPDATED,
        entityType: 'settings',
        entityId: SETTINGS_KEY,
        before,
        after,
        request,
      },
      tx,
    );

    return after;
  });
}

module.exports = { SETTINGS_KEY, DEFAULTS, FIELDS, get, getPublic, update };
