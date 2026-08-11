'use strict';

const { StateMachine } = require('../shared/stateMachine');
const { ROLES } = require('../shared/roles');

const { CUSTOMER, STAFF, ADMIN } = ROLES;

/**
 * Estados de una orden de lavanderia.
 *
 * A diferencia de limpieza, aqui hay una cadena logistica: la ropa sale del
 * domicilio, se procesa en planta y vuelve. Por eso el ciclo tiene dos tramos
 * de transporte (recogida y entrega) y un tramo de proceso interno.
 */
const STATES = {
  REQUESTED: { label: 'Solicitud recibida' },
  PICKUP_SCHEDULED: { label: 'Recogida agendada' },
  ASSIGNED: { label: 'Responsable asignado' },
  PICKUP_CONFIRMED: { label: 'Recogida confirmada' },
  PICKED_UP: { label: 'Ropa recogida' },
  RECEIVED: { label: 'Recibida en planta' },
  PROCESSING: { label: 'En preparación' },
  WASHING: { label: 'Lavando' },
  DRYING: { label: 'Secando' },
  FOLDING: { label: 'Doblando' },
  READY_FOR_DELIVERY: { label: 'Lista para entrega' },
  OUT_FOR_DELIVERY: { label: 'En camino a tu domicilio' },
  DELIVERED: { label: 'Entregada' },
  COMPLETED: { label: 'Completada', terminal: true },

  CANCELLED: { label: 'Cancelada', terminal: true, exceptional: true },
  ISSUE_REPORTED: { label: 'Incidencia reportada', exceptional: true },
  REQUIRES_REVIEW: { label: 'Requiere revisión', exceptional: true },
};

// Cadena principal. Cada paso registra su timestamp para dar trazabilidad
// completa de la orden, que es lo mas critico de este negocio.
const MAIN_CHAIN = [
  ['REQUESTED', 'PICKUP_SCHEDULED', [ADMIN], []],
  ['PICKUP_SCHEDULED', 'ASSIGNED', [ADMIN], []],
  ['ASSIGNED', 'PICKUP_CONFIRMED', [STAFF, ADMIN], ['confirmed_at']],
  ['PICKUP_CONFIRMED', 'PICKED_UP', [STAFF, ADMIN], ['picked_up_at']],
  ['PICKED_UP', 'RECEIVED', [STAFF, ADMIN], ['received_at']],
  ['RECEIVED', 'PROCESSING', [STAFF, ADMIN], ['processing_at']],
  ['PROCESSING', 'WASHING', [STAFF, ADMIN], ['washing_at']],
  ['WASHING', 'DRYING', [STAFF, ADMIN], ['drying_at']],
  ['DRYING', 'FOLDING', [STAFF, ADMIN], ['folding_at']],
  ['FOLDING', 'READY_FOR_DELIVERY', [STAFF, ADMIN], ['ready_at']],
  ['READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', [STAFF, ADMIN], ['out_for_delivery_at']],
  ['OUT_FOR_DELIVERY', 'DELIVERED', [STAFF, ADMIN], ['delivered_at']],
  ['DELIVERED', 'COMPLETED', [ADMIN], ['completed_at']],
];

// Estados operativos desde los que tiene sentido reportar una incidencia
// (una prenda danada, una bolsa que no cuadra, un cliente ausente).
const OPERATIONAL_STATES = [
  'PICKUP_CONFIRMED',
  'PICKED_UP',
  'RECEIVED',
  'PROCESSING',
  'WASHING',
  'DRYING',
  'FOLDING',
  'READY_FOR_DELIVERY',
  'OUT_FOR_DELIVERY',
];

const TRANSITIONS = [
  ...MAIN_CHAIN.map(([from, to, roles, timestamps]) => ({ from, to, roles, timestamps })),

  // Reasignacion antes de que la ropa salga del domicilio.
  { from: 'ASSIGNED', to: 'PICKUP_SCHEDULED', roles: [ADMIN], label: 'Devuelto a asignación' },
  { from: 'PICKUP_CONFIRMED', to: 'PICKUP_SCHEDULED', roles: [ADMIN], label: 'Devuelto a asignación' },

  // La entrega puede fallar y volver a intentarse.
  { from: 'OUT_FOR_DELIVERY', to: 'READY_FOR_DELIVERY', roles: [STAFF, ADMIN], label: 'Entrega reprogramada' },

  // Incidencias desde cualquier punto operativo.
  ...OPERATIONAL_STATES.map((from) => ({
    from,
    to: 'ISSUE_REPORTED',
    roles: [STAFF, ADMIN],
    timestamps: ['issue_reported_at'],
  })),
  // Tras resolver la incidencia se retoma el proceso donde corresponda.
  // Operaciones elige el punto de retorno, no se asume automaticamente.
  ...['PROCESSING', 'WASHING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'].map((to) => ({
    from: 'ISSUE_REPORTED',
    to,
    roles: [ADMIN],
    label: 'Incidencia resuelta',
  })),
  { from: 'ISSUE_REPORTED', to: 'REQUIRES_REVIEW', roles: [ADMIN] },
  { from: 'ISSUE_REPORTED', to: 'CANCELLED', roles: [ADMIN], timestamps: ['cancelled_at'] },

  { from: 'REQUIRES_REVIEW', to: 'PROCESSING', roles: [ADMIN] },
  { from: 'REQUIRES_REVIEW', to: 'READY_FOR_DELIVERY', roles: [ADMIN] },
  { from: 'REQUIRES_REVIEW', to: 'COMPLETED', roles: [ADMIN], timestamps: ['completed_at'] },
  { from: 'REQUIRES_REVIEW', to: 'CANCELLED', roles: [ADMIN], timestamps: ['cancelled_at'] },

  // Cancelacion: el cliente solo puede cancelar mientras su ropa siga en casa.
  ...['REQUESTED', 'PICKUP_SCHEDULED', 'ASSIGNED', 'PICKUP_CONFIRMED'].map((from) => ({
    from,
    to: 'CANCELLED',
    roles: [CUSTOMER, ADMIN],
    timestamps: ['cancelled_at'],
  })),
  // Una vez recogida la ropa, cancelar es una decision de Operaciones.
  ...['PICKED_UP', 'RECEIVED', 'PROCESSING'].map((from) => ({
    from,
    to: 'CANCELLED',
    roles: [ADMIN],
    timestamps: ['cancelled_at'],
  })),
];

const laundryStateMachine = new StateMachine({
  name: 'laundry',
  initialState: 'REQUESTED',
  states: STATES,
  transitions: TRANSITIONS,
});

module.exports = { laundryStateMachine, LAUNDRY_STATES: STATES };
