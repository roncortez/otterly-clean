'use strict';

const { db } = require('../index');

/**
 * Trabajadores.
 *
 * Dos proyecciones deliberadamente distintas:
 *   - PUBLIC_FIELDS: lo unico que puede ver un cliente. Genera confianza
 *     (nombre, foto, verificado) sin exponer datos personales.
 *   - ADMIN_FIELDS: perfil operativo completo, solo para ADMIN.
 */

const PUBLIC_FIELDS = `
  u.id,
  COALESCE(sp.display_name, u.first_name) AS display_name,
  sp.photo_url,
  sp.bio,
  (sp.verification_status = 'VERIFIED') AS is_verified
`;

const ADMIN_FIELDS = `
  u.id, u.email, u.first_name, u.last_name, u.phone, u.status, u.region_code,
  u.created_at, u.last_login_at,
  sp.employee_code, sp.display_name, sp.photo_url, sp.bio, sp.hired_at,
  sp.verification_status, sp.verified_at, sp.verified_by,
  sp.background_check_status, sp.documents, sp.skills, sp.service_types, sp.active
`;

/** Vista publica: lo que el cliente ve del profesional asignado. */
async function findPublicProfile(staffId, tx = db) {
  return tx.oneOrNone(
    `SELECT ${PUBLIC_FIELDS}
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.id = $1 AND u.role = 'STAFF'`,
    [staffId],
  );
}

async function findAdminProfile(staffId, tx = db) {
  return tx.oneOrNone(
    `SELECT ${ADMIN_FIELDS}
       FROM users u
       JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.id = $1 AND u.role = 'STAFF'`,
    [staffId],
  );
}

async function createProfile(
  { userId, employeeCode, displayName, photoUrl, bio, hiredAt, skills = [], serviceTypes = [] },
  tx = db,
) {
  return tx.one(
    `INSERT INTO staff_profiles
       (user_id, employee_code, display_name, photo_url, bio, hired_at, skills, service_types)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, employeeCode ?? null, displayName ?? null, photoUrl ?? null, bio ?? null, hiredAt ?? null, skills, serviceTypes],
  );
}

async function updateProfile(userId, fields, tx = db) {
  const allowed = [
    'employee_code',
    'display_name',
    'photo_url',
    'bio',
    'hired_at',
    'verification_status',
    'background_check_status',
    'skills',
    'service_types',
    'active',
  ];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return findAdminProfile(userId, tx);

  const sets = entries.map(([key], index) => `${key} = $${index + 2}`);
  await tx.none(
    `UPDATE staff_profiles SET ${sets.join(', ')}, updated_at = NOW() WHERE user_id = $1`,
    [userId, ...entries.map(([, value]) => value)],
  );
  return findAdminProfile(userId, tx);
}

async function setVerification(userId, { status, verifiedBy }, tx = db) {
  await tx.none(
    `UPDATE staff_profiles
        SET verification_status = $2,
            verified_at = CASE WHEN $2 = 'VERIFIED' THEN NOW() ELSE NULL END,
            verified_by = $3,
            updated_at = NOW()
      WHERE user_id = $1`,
    [userId, status, verifiedBy ?? null],
  );
  return findAdminProfile(userId, tx);
}

/**
 * Listado para Operaciones, con la carga de trabajo del dia para poder decidir
 * a quien asignar sin salir de la pantalla.
 */
async function list({ active, verificationStatus, serviceType, date, search }, tx = db) {
  const conditions = ["u.role = 'STAFF'"];
  const values = [];

  const push = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (active !== undefined) conditions.push(`sp.active = ${push(active)}`);
  if (verificationStatus) conditions.push(`sp.verification_status = ${push(verificationStatus)}`);
  if (serviceType) conditions.push(`${push(serviceType)} = ANY(sp.service_types)`);
  if (search) {
    const p = push(`%${search}%`);
    conditions.push(`(u.first_name ILIKE ${p} OR u.last_name ILIKE ${p} OR u.email ILIKE ${p})`);
  }

  const dateParam = push(date ?? new Date().toISOString().slice(0, 10));

  return tx.any(
    `SELECT ${ADMIN_FIELDS},
            (SELECT COUNT(*)::int FROM assignments a
               JOIN orders o ON o.id = a.order_id
              WHERE a.staff_id = u.id
                AND a.status IN ('OFFERED', 'ACCEPTED')
                AND o.scheduled_date = ${dateParam}::date) AS jobs_today
       FROM users u
       JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY sp.active DESC, u.first_name`,
    values,
  );
}

async function listZones(staffId, tx = db) {
  return tx.any(
    `SELECT z.* FROM staff_zones sz JOIN service_zones z ON z.id = sz.zone_id
      WHERE sz.staff_id = $1`,
    [staffId],
  );
}

async function setZones(staffId, zoneIds, tx = db) {
  await tx.none('DELETE FROM staff_zones WHERE staff_id = $1', [staffId]);
  for (const zoneId of zoneIds) {
    await tx.none('INSERT INTO staff_zones (staff_id, zone_id) VALUES ($1, $2)', [staffId, zoneId]);
  }
  return listZones(staffId, tx);
}

/**
 * Candidatos para atender una orden: activos, verificados, habilitados para el
 * tipo de servicio y, si la orden tiene zona, que cubran esa zona.
 */
async function findCandidates({ serviceType, zoneId, date }, tx = db) {
  const values = [serviceType, date ?? new Date().toISOString().slice(0, 10)];
  let zoneCondition = '';

  if (zoneId) {
    values.push(zoneId);
    zoneCondition = `AND (
      NOT EXISTS (SELECT 1 FROM staff_zones sz WHERE sz.staff_id = u.id)
      OR EXISTS (SELECT 1 FROM staff_zones sz WHERE sz.staff_id = u.id AND sz.zone_id = $3)
    )`;
  }

  return tx.any(
    `SELECT ${ADMIN_FIELDS},
            (SELECT COUNT(*)::int FROM assignments a
               JOIN orders o ON o.id = a.order_id
              WHERE a.staff_id = u.id
                AND a.status IN ('OFFERED', 'ACCEPTED')
                AND o.scheduled_date = $2::date) AS jobs_today
       FROM users u
       JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.role = 'STAFF'
        AND u.status = 'ACTIVE'
        AND sp.active = TRUE
        AND sp.verification_status = 'VERIFIED'
        AND $1 = ANY(sp.service_types)
        ${zoneCondition}
      ORDER BY jobs_today ASC, u.first_name`,
    values,
  );
}

module.exports = {
  PUBLIC_FIELDS,
  findPublicProfile,
  findAdminProfile,
  createProfile,
  updateProfile,
  setVerification,
  list,
  listZones,
  setZones,
  findCandidates,
};
