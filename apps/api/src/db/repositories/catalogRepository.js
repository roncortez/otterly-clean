'use strict';

const { db } = require('../index');

/** Catalogo de planes, extras y zonas de cobertura. */

async function listPlans({ serviceType, regionCode, includeInactive = false }, tx = db) {
  const conditions = ['region_code = $1'];
  const values = [regionCode];

  if (serviceType) {
    values.push(serviceType);
    conditions.push(`service_type = $${values.length}`);
  }
  if (!includeInactive) conditions.push('active = TRUE');

  return tx.any(
    `SELECT * FROM service_plans WHERE ${conditions.join(' AND ')}
      ORDER BY service_type, display_order, name`,
    values,
  );
}

async function findPlanById(id, tx = db) {
  return tx.oneOrNone('SELECT * FROM service_plans WHERE id = $1', [id]);
}

async function findPlanByCode(code, regionCode, tx = db) {
  return tx.oneOrNone('SELECT * FROM service_plans WHERE code = $1 AND region_code = $2', [
    code,
    regionCode,
  ]);
}

/**
 * Actualiza los parametros comerciales de un plan.
 *
 * `config` guarda los parametros del modelo de precio (minimo de horas, tramos,
 * unidad...). El servicio que llama aqui ya los valido contra el descriptor del
 * modelo: este modulo no decide que claves son legitimas, solo persiste.
 */
async function updatePlan(id, fields, tx = db) {
  const allowed = [
    'name',
    'description',
    'base_amount',
    'config',
    'estimated_duration_minutes',
    'active',
    'display_order',
  ];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return findPlanById(id, tx);

  const sets = entries.map(([key], index) =>
    key === 'config' ? `config = $${index + 2}:json` : `${key} = $${index + 2}`,
  );

  return tx.oneOrNone(
    `UPDATE service_plans SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    [id, ...entries.map(([, value]) => value)],
  );
}

async function listExtras({ serviceType, regionCode }, tx = db) {
  return tx.any(
    `SELECT * FROM service_extras
      WHERE region_code = $1 AND service_type = $2 AND active = TRUE
      ORDER BY display_order, name`,
    [regionCode, serviceType],
  );
}

async function findExtrasByCodes(codes, regionCode, tx = db) {
  if (!codes?.length) return [];
  return tx.any(
    'SELECT * FROM service_extras WHERE region_code = $1 AND code = ANY($2) AND active = TRUE',
    [regionCode, codes],
  );
}

async function listZones({ regionCode, includeInactive = false }, tx = db) {
  const conditions = ['region_code = $1'];
  if (!includeInactive) conditions.push('active = TRUE');
  return tx.any(
    `SELECT * FROM service_zones WHERE ${conditions.join(' AND ')} ORDER BY city, name`,
    [regionCode],
  );
}

async function findZoneById(id, tx = db) {
  return tx.oneOrNone('SELECT * FROM service_zones WHERE id = $1', [id]);
}

async function createZone({ regionCode, code, name, city, administrativeArea }, tx = db) {
  return tx.one(
    `INSERT INTO service_zones (region_code, code, name, city, administrative_area)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [regionCode, code, name, city, administrativeArea ?? null],
  );
}

async function setZoneActive(id, active, tx = db) {
  return tx.one('UPDATE service_zones SET active = $2 WHERE id = $1 RETURNING *', [id, active]);
}

module.exports = {
  listPlans,
  findPlanById,
  findPlanByCode,
  updatePlan,
  listExtras,
  findExtrasByCodes,
  listZones,
  findZoneById,
  createZone,
  setZoneActive,
};
