'use strict';

const { StateMachine } = require('../shared/stateMachine');
const { ROLES } = require('../shared/roles');

const { CUSTOMER, STAFF, ADMIN } = ROLES;

/**
 * Estados de una orden de limpieza.
 *
 * `customerVisible: false` marca estados internos que no se dibujan como paso
 * del timeline del cliente (pero cuyo cambio si se registra en el historial).
 * `exceptional: true` marca ramas alternativas (cancelacion, incidencia).
 */
const STATES = {
  REQUESTED: { label: 'Servicio solicitado' },
  PENDING_ASSIGNMENT: { label: 'Buscando profesional' },
  ASSIGNED: { label: 'Profesional asignado' },
  CONFIRMED: { label: 'Profesional confirmo' },
  ON_THE_WAY: { label: 'En camino' },
  ARRIVED: { label: 'Llego al domicilio' },
  IN_PROGRESS: { label: 'Limpieza en progreso' },
  COMPLETED: { label: 'Limpieza finalizada', terminal: true },

  CANCELLED: { label: 'Cancelado', terminal: true, exceptional: true },
  NO_ACCESS: { label: 'Sin acceso al domicilio', exceptional: true },
  INCIDENT_REPORTED: { label: 'Incidencia reportada', exceptional: true },
  REQUIRES_REVIEW: { label: 'Requiere revision', exceptional: true },
};

const TRANSITIONS = [
  // --- Flujo principal ---------------------------------------------------
  // La solicitud entra a la cola de Operaciones automaticamente.
  { from: 'REQUESTED', to: 'PENDING_ASSIGNMENT', roles: [ADMIN], label: 'Enviado a asignacion' },
  // La asignacion la hace la empresa, nunca el trabajador.
  { from: 'PENDING_ASSIGNMENT', to: 'ASSIGNED', roles: [ADMIN], label: 'Profesional asignado' },
  // El trabajador acepta el trabajo que le entregaron.
  { from: 'ASSIGNED', to: 'CONFIRMED', roles: [STAFF, ADMIN], timestamps: ['confirmed_at'] },
  { from: 'CONFIRMED', to: 'ON_THE_WAY', roles: [STAFF, ADMIN], timestamps: ['on_the_way_at'] },
  { from: 'ON_THE_WAY', to: 'ARRIVED', roles: [STAFF, ADMIN], timestamps: ['arrived_at'] },
  { from: 'ARRIVED', to: 'IN_PROGRESS', roles: [STAFF, ADMIN], timestamps: ['started_at'] },
  { from: 'IN_PROGRESS', to: 'COMPLETED', roles: [STAFF, ADMIN], timestamps: ['completed_at'] },

  // --- Reasignacion ------------------------------------------------------
  // Operaciones puede devolver a la cola si el trabajador no confirma o falla.
  { from: 'ASSIGNED', to: 'PENDING_ASSIGNMENT', roles: [ADMIN], label: 'Devuelto a asignacion' },
  { from: 'CONFIRMED', to: 'PENDING_ASSIGNMENT', roles: [ADMIN], label: 'Devuelto a asignacion' },

  // --- Sin acceso --------------------------------------------------------
  // El trabajador llego pero no pudo entrar. No es un fracaso definitivo:
  // Operaciones decide si se reagenda o se cierra.
  { from: 'ARRIVED', to: 'NO_ACCESS', roles: [STAFF, ADMIN], timestamps: ['no_access_at'] },
  { from: 'ON_THE_WAY', to: 'NO_ACCESS', roles: [STAFF, ADMIN], timestamps: ['no_access_at'] },
  { from: 'NO_ACCESS', to: 'REQUIRES_REVIEW', roles: [ADMIN] },
  { from: 'NO_ACCESS', to: 'IN_PROGRESS', roles: [STAFF, ADMIN], timestamps: ['started_at'] },
  { from: 'NO_ACCESS', to: 'CANCELLED', roles: [ADMIN], timestamps: ['cancelled_at'] },

  // --- Incidencias -------------------------------------------------------
  // Se puede reportar una incidencia desde cualquier punto operativo.
  ...['CONFIRMED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'].map((from) => ({
    from,
    to: 'INCIDENT_REPORTED',
    roles: [STAFF, ADMIN],
    timestamps: ['incident_reported_at'],
  })),
  // Tras una incidencia: se retoma, escala a revision o se cancela.
  { from: 'INCIDENT_REPORTED', to: 'IN_PROGRESS', roles: [STAFF, ADMIN] },
  { from: 'INCIDENT_REPORTED', to: 'COMPLETED', roles: [STAFF, ADMIN], timestamps: ['completed_at'] },
  { from: 'INCIDENT_REPORTED', to: 'REQUIRES_REVIEW', roles: [ADMIN] },
  { from: 'INCIDENT_REPORTED', to: 'CANCELLED', roles: [ADMIN], timestamps: ['cancelled_at'] },

  // --- Revision ----------------------------------------------------------
  { from: 'REQUIRES_REVIEW', to: 'PENDING_ASSIGNMENT', roles: [ADMIN] },
  { from: 'REQUIRES_REVIEW', to: 'COMPLETED', roles: [ADMIN], timestamps: ['completed_at'] },
  { from: 'REQUIRES_REVIEW', to: 'CANCELLED', roles: [ADMIN], timestamps: ['cancelled_at'] },

  // --- Cancelacion -------------------------------------------------------
  // El cliente solo puede cancelar antes de que el trabajo arranque, y la
  // politica horaria se valida aparte (cancellationPolicy.js).
  ...['REQUESTED', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'CONFIRMED'].map((from) => ({
    from,
    to: 'CANCELLED',
    roles: [CUSTOMER, ADMIN],
    timestamps: ['cancelled_at'],
  })),
  // Una vez el profesional va en camino o esta en sitio, solo Operaciones.
  ...['ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'].map((from) => ({
    from,
    to: 'CANCELLED',
    roles: [ADMIN],
    timestamps: ['cancelled_at'],
  })),
];

const cleaningStateMachine = new StateMachine({
  name: 'cleaning',
  initialState: 'REQUESTED',
  states: STATES,
  transitions: TRANSITIONS,
});

module.exports = { cleaningStateMachine, CLEANING_STATES: STATES };
