'use strict';

const { db } = require('../index');

/**
 * Acceso a datos de usuarios.
 *
 * `password_hash` nunca sale de este modulo salvo por findByEmailWithSecret,
 * que existe solo para el login.
 */

const PUBLIC_FIELDS = `
  id, email, first_name, last_name, phone, role, region_code, locale,
  status, last_login_at, created_at
`;

async function findById(id, tx = db) {
  return tx.oneOrNone(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [id]);
}

async function findByEmail(email, tx = db) {
  return tx.oneOrNone(`SELECT ${PUBLIC_FIELDS} FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
}

/** Solo para autenticacion. */
async function findByEmailWithSecret(email, tx = db) {
  return tx.oneOrNone(
    `SELECT ${PUBLIC_FIELDS}, password_hash FROM users WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
}

async function create(
  { email, passwordHash, firstName, lastName, phone, role, regionCode, locale, status = 'ACTIVE' },
  tx = db,
) {
  return tx.one(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, region_code, locale, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${PUBLIC_FIELDS}`,
    [email.trim(), passwordHash, firstName.trim(), lastName.trim(), phone ?? null, role, regionCode, locale, status],
  );
}

async function update(id, fields, tx = db) {
  const allowed = ['first_name', 'last_name', 'phone', 'locale', 'region_code', 'status'];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return findById(id, tx);

  const sets = entries.map(([key], index) => `${key} = $${index + 2}`);
  return tx.one(
    `UPDATE users SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1 RETURNING ${PUBLIC_FIELDS}`,
    [id, ...entries.map(([, value]) => value)],
  );
}

async function updatePassword(id, passwordHash, tx = db) {
  return tx.none('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [
    id,
    passwordHash,
  ]);
}

async function touchLogin(id, tx = db) {
  return tx.none('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);
}

/** Listado paginado con filtros, usado por Operaciones. */
async function list({ role, status, search, page = 1, limit = 20 }, tx = db) {
  const conditions = [];
  const values = [];

  if (role) {
    values.push(role);
    conditions.push(`role = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;
    conditions.push(`(first_name ILIKE ${p} OR last_name ILIKE ${p} OR email ILIKE ${p} OR phone ILIKE ${p})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  values.push(limit, offset);

  // Secuencial: una conexion no ejecuta dos consultas simultaneas.
  const [rows, count] = await tx.task(async (t) => [
    await t.any(
      `SELECT ${PUBLIC_FIELDS} FROM users ${where}
        ORDER BY created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    ),
    await t.one(`SELECT COUNT(*)::int AS total FROM users ${where}`, values.slice(0, -2)),
  ]);

  return {
    data: rows,
    pagination: { page, limit, total: count.total, totalPages: Math.ceil(count.total / limit) },
  };
}

module.exports = {
  PUBLIC_FIELDS,
  findById,
  findByEmail,
  findByEmailWithSecret,
  create,
  update,
  updatePassword,
  touchLogin,
  list,
};
