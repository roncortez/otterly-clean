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

/**
 * Opciones de una lista configurable (fragancias, y las que vengan).
 *
 * `kind` discrimina la lista; ver migracion 014. Se devuelven solo las activas:
 * una opcion retirada deja de ofrecerse, pero las ordenes que ya la citan
 * siguen leyendose porque guardan el codigo, no una referencia.
 */
async function listOptions({ kind, regionCode, serviceType = null }, tx = db) {
  const conditions = ['kind = $1', 'region_code = $2', 'active = TRUE'];
  const values = [kind, regionCode];

  // NULL en `service_type` significa "sirve para cualquiera", asi que una
  // consulta por servicio tiene que traerlas tambien.
  if (serviceType) {
    values.push(serviceType);
    conditions.push(`(service_type IS NULL OR service_type = $${values.length})`);
  }

  return tx.any(
    `SELECT id, kind, code, label, description, service_type, display_order
       FROM catalog_options
      WHERE ${conditions.join(' AND ')}
      ORDER BY display_order, label`,
    values,
  );
}

/** Comprueba que un codigo de opcion existe y sigue activo en la region. */
async function findOptionByCode({ kind, code, regionCode }, tx = db) {
  return tx.oneOrNone(
    `SELECT id, kind, code, label FROM catalog_options
      WHERE kind = $1 AND code = $2 AND region_code = $3 AND active = TRUE`,
    [kind, code, regionCode],
  );
}

/** Catalogo de productos de la region. Ver migracion 013. */
async function listProducts({ regionCode, includeInactive = false }, tx = db) {
  const conditions = ['region_code = $1'];
  if (!includeInactive) conditions.push('active = TRUE');

  return tx.any(
    `SELECT id, code, name, description, amount, currency, image_url, category, display_order
       FROM products
      WHERE ${conditions.join(' AND ')}
      ORDER BY display_order, name`,
    [regionCode],
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

/**
 * Crea una zona.
 *
 * El centro y el radio son opcionales: una zona sin ellos sigue sirviendo como
 * etiqueta, simplemente no participa en la comprobacion de cobertura. Poder
 * darselos desde Operaciones es lo que evita que abrir una ciudad nueva exija
 * tocar codigo.
 */
async function createZone(
  { regionCode, code, name, city, administrativeArea, centerLatitude, centerLongitude, radiusKm },
  tx = db,
) {
  return tx.one(
    `INSERT INTO service_zones
       (region_code, code, name, city, administrative_area,
        center_latitude, center_longitude, radius_km)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      regionCode,
      code,
      name,
      city,
      administrativeArea ?? null,
      centerLatitude ?? null,
      centerLongitude ?? null,
      radiusKm ?? null,
    ],
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
  listOptions,
  findOptionByCode,
  listProducts,
  listZones,
  findZoneById,
  createZone,
  setZoneActive,
};
