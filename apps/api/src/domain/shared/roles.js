'use strict';

/**
 * Roles del sistema.
 *
 * La plataforma NO es un marketplace abierto: STAFF son trabajadores
 * contratados y verificados por la empresa. No pueden buscar ni tomar trabajos
 * libremente, solo actuar sobre asignaciones que Operaciones les entrega.
 */
const ROLES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  STAFF: 'STAFF',
  ADMIN: 'ADMIN',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

/** Actor sintetico para transiciones ejecutadas por el propio sistema. */
const SYSTEM_ACTOR = 'SYSTEM';

function isValidRole(role) {
  return ALL_ROLES.includes(role);
}

module.exports = { ROLES, ALL_ROLES, SYSTEM_ACTOR, isValidRole };
