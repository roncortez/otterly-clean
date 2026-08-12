'use strict';

const { db } = require('../index');

/**
 * Configuracion comercial de los tipos de servicio.
 *
 * La tabla tiene exactamente tres filas, una por tipo implementado en el
 * dominio. No hay `create` a proposito: el administrador configura los
 * servicios que existen, no inventa tipos nuevos. Un cuarto tipo necesita
 * maquina de estados, tabla de detalle y flujo de reserva; eso es codigo.
 */

async function list(tx = db) {
  return tx.any('SELECT * FROM service_settings ORDER BY display_order, service_type');
}

async function findByType(serviceType, tx = db) {
  return tx.oneOrNone('SELECT * FROM service_settings WHERE service_type = $1', [serviceType]);
}

/** Solo los tipos que la empresa ofrece ahora mismo. */
async function listActive(tx = db) {
  return tx.any('SELECT * FROM service_settings WHERE active ORDER BY display_order, service_type');
}

async function update(serviceType, fields, updatedBy = null, tx = db) {
  // Lista blanca de columnas: los nombres nunca vienen de la peticion.
  const allowed = [
    'active',
    'display_name',
    'description',
    'customer_info',
    'icon',
    'image_url',
    'display_order',
  ];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return findByType(serviceType, tx);

  const sets = entries.map(([key], index) => `${key} = $${index + 3}`);
  return tx.one(
    `UPDATE service_settings
        SET ${sets.join(', ')}, updated_by = $2, updated_at = NOW()
      WHERE service_type = $1
      RETURNING *`,
    [serviceType, updatedBy, ...entries.map(([, value]) => value)],
  );
}

module.exports = { list, listActive, findByType, update };
