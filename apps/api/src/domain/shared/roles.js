'use strict';

/**
 * Roles del sistema.
 *
 * La plataforma NO es un marketplace abierto: STAFF son trabajadores
 * contratados y verificados por la empresa. No pueden buscar ni tomar trabajos
 * libremente, solo actuar sobre asignaciones que Operaciones les entrega.
 *
 * Una persona puede tener VARIOS roles a la vez: quien coordina la operacion
 * tambien sale a trabajar. Por eso el modelo es una lista, no un campo unico.
 *
 * Un rol NO es una capacidad profesional. Que alguien sea STAFF dice que puede
 * entrar a /trabajo; que atienda limpieza o lavanderia es otra cosa distinta y
 * vive en staff_profiles.service_types.
 */
const ROLES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  STAFF: 'STAFF',
  ADMIN: 'ADMIN',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

/**
 * Orden de privilegio, de mayor a menor. Se usa para elegir un rol "principal"
 * cuando hay que mostrar uno solo (etiquetas, pantalla de inicio), nunca para
 * autorizar: autorizar siempre comprueba la pertenencia a la lista.
 */
const ROLE_PRIORITY = Object.freeze([ROLES.ADMIN, ROLES.STAFF, ROLES.CUSTOMER]);

/** Actor sintetico para transiciones ejecutadas por el propio sistema. */
const SYSTEM_ACTOR = 'SYSTEM';

function isValidRole(role) {
  return ALL_ROLES.includes(role);
}

/** Normaliza cualquier entrada a una lista de roles validos, sin repetidos. */
function normalizeRoles(roles) {
  if (!roles) return [];
  const list = Array.isArray(roles) ? roles : [roles];
  return ALL_ROLES.filter((role) => list.includes(role));
}

/** Comprobacion de autorizacion. Es la unica pregunta que importa. */
function hasRole(roles, role) {
  return normalizeRoles(roles).includes(role);
}

function hasAnyRole(roles, required) {
  const owned = normalizeRoles(roles);
  return required.some((role) => owned.includes(role));
}

/** Rol de mayor privilegio de la lista, o null si no tiene ninguno. */
function primaryRole(roles) {
  const owned = normalizeRoles(roles);
  return ROLE_PRIORITY.find((role) => owned.includes(role)) ?? null;
}

module.exports = {
  ROLES,
  ALL_ROLES,
  ROLE_PRIORITY,
  SYSTEM_ACTOR,
  isValidRole,
  normalizeRoles,
  hasRole,
  hasAnyRole,
  primaryRole,
};
