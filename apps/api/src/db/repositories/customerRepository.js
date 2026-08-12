'use strict';

const { db } = require('../index');

/**
 * Ficha del cliente.
 *
 * Existia como tabla desde el principio pero no tenia repositorio: se creaba en
 * el registro y nadie mas la tocaba. El onboarding necesita leerla y
 * completarla, asi que aqui vive su acceso, con la misma lista blanca de
 * columnas que el resto de actualizaciones parciales del proyecto.
 */

const FIELDS = `
  user_id, tax_id_type, tax_id, marketing_opt_in, photo_url, photo_public_id,
  onboarding_completed_at, created_at, updated_at
`;

async function find(userId, tx = db) {
  return tx.oneOrNone(`SELECT ${FIELDS} FROM customer_profiles WHERE user_id = $1`, [userId]);
}

/**
 * Garantiza la ficha. Hace falta cuando alguien recibe el rol CUSTOMER despues
 * de existir como trabajador o administrador.
 */
async function ensure(userId, tx = db) {
  await tx.none(
    'INSERT INTO customer_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId],
  );
  return find(userId, tx);
}

async function update(userId, fields, tx = db) {
  const allowed = [
    'tax_id_type',
    'tax_id',
    'marketing_opt_in',
    'photo_url',
    'photo_public_id',
    'onboarding_completed_at',
  ];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return find(userId, tx);

  const sets = entries.map(([key], index) => `${key} = $${index + 2}`);
  await tx.none(
    `UPDATE customer_profiles SET ${sets.join(', ')}, updated_at = NOW() WHERE user_id = $1`,
    [userId, ...entries.map(([, value]) => value)],
  );
  return find(userId, tx);
}

module.exports = { FIELDS, find, ensure, update };
