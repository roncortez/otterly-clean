'use strict';

const { db } = require('../index');

/**
 * Acceso a datos de usuarios.
 *
 * `password_hash` nunca sale de este modulo salvo por findByEmailWithSecret,
 * que existe solo para el login.
 *
 * Los roles viven en `user_roles`, no en una columna: una persona puede ser
 * ADMIN y STAFF a la vez. Toda lectura de usuario devuelve `roles` como array
 * para que ninguna capa superior tenga que acordarse de hacer el JOIN.
 */

const ROLES_SUBQUERY = `
  COALESCE(
    (SELECT ARRAY_AGG(ur.role ORDER BY ur.role) FROM user_roles ur WHERE ur.user_id = users.id),
    '{}'
  ) AS roles
`;

const PUBLIC_FIELDS = `
  id, email, first_name, last_name, phone, region_code, locale,
  status, last_login_at, created_at,
  ${ROLES_SUBQUERY}
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
  { email, passwordHash, firstName, lastName, phone, roles = [], regionCode, locale, status = 'ACTIVE' },
  tx = db,
) {
  const user = await tx.one(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, region_code, locale, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [email.trim(), passwordHash, firstName.trim(), lastName.trim(), phone ?? null, regionCode, locale, status],
  );

  await setRoles(user.id, roles, null, tx);
  return findById(user.id, tx);
}

async function update(id, fields, tx = db) {
  const allowed = ['first_name', 'last_name', 'phone', 'locale', 'region_code', 'status'];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return findById(id, tx);

  const sets = entries.map(([key], index) => `${key} = $${index + 2}`);
  await tx.none(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, [
    id,
    ...entries.map(([, value]) => value),
  ]);
  return findById(id, tx);
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

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

async function listRoles(userId, tx = db) {
  const rows = await tx.any('SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role', [userId]);
  return rows.map((row) => row.role);
}

/**
 * Reemplaza el conjunto de roles. Se borra y se inserta en la misma
 * transaccion para que nunca exista un instante sin roles.
 */
async function setRoles(userId, roles, grantedBy = null, tx = db) {
  await tx.none('DELETE FROM user_roles WHERE user_id = $1', [userId]);
  for (const role of roles) {
    await tx.none(
      `INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId, role, grantedBy],
    );
  }
  return listRoles(userId, tx);
}

/**
 * Cuantos administradores activos quedarian si se excluye a esta persona.
 *
 * Es la comprobacion que impide dejar el sistema sin nadie que pueda entrar a
 * Operaciones. Se ejecuta dentro de la transaccion del cambio.
 */
async function countActiveAdmins({ excludeUserId = null } = {}, tx = db) {
  const row = await tx.one(
    `SELECT COUNT(*)::int AS total
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'ADMIN'
      WHERE u.status = 'ACTIVE' AND ($1::bigint IS NULL OR u.id <> $1)`,
    [excludeUserId],
  );
  return row.total;
}

/** Listado paginado con filtros, usado por Operaciones. */
async function list({ role, status, search, page = 1, limit = 20 }, tx = db) {
  const conditions = [];
  const values = [];

  if (role) {
    values.push(role);
    conditions.push(
      `EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = users.id AND ur.role = $${values.length})`,
    );
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
  listRoles,
  setRoles,
  countActiveAdmins,
  list,
};
