'use strict';

const { StateMachine } = require('../shared/stateMachine');
const { ROLES } = require('../shared/roles');

const { CUSTOMER, ADMIN } = ROLES;

/**
 * Estados de una orden de kits de limpieza.
 *
 * El flujo es mas simple que limpieza o lavanderia: no hay asignacion de
 * trabajador ni seguimiento logistico de bolsas. Operaciones prepara el kit,
 * lo despacha y marca la entrega.
 *
 * `terminal: true` marca estados de los que no se puede salir.
 * `exceptional: true` marca ramas alternativas (cancelacion, incidencia).
 */
const STATES = {
  REQUESTED:  { label: 'Pedido recibido' },
  PREPARING:  { label: 'Preparando tu kit' },
  DISPATCHED: { label: 'En camino' },
  DELIVERED:  { label: 'Entregado', terminal: true },

  CANCELLED:  { label: 'Cancelado', terminal: true, exceptional: true },
};

const TRANSITIONS = [
  // --- Flujo principal -------------------------------------------------------
  // Operaciones prepara el kit tras revisar el pedido.
  { from: 'REQUESTED',  to: 'PREPARING',  roles: [ADMIN], label: 'Preparacion iniciada' },
  // El kit sale hacia el domicilio.
  { from: 'PREPARING',  to: 'DISPATCHED', roles: [ADMIN], timestamps: ['dispatched_at'] },
  // Confirmacion de entrega en el domicilio.
  { from: 'DISPATCHED', to: 'DELIVERED',  roles: [ADMIN], timestamps: ['delivered_at'] },

  // --- Cancelacion -----------------------------------------------------------
  // El cliente puede cancelar antes de que el kit salga.
  ...['REQUESTED', 'PREPARING'].map((from) => ({
    from,
    to: 'CANCELLED',
    roles: [CUSTOMER, ADMIN],
    timestamps: ['cancelled_at'],
  })),
  // Una vez despachado, solo Operaciones puede cancelar.
  { from: 'DISPATCHED', to: 'CANCELLED', roles: [ADMIN], timestamps: ['cancelled_at'] },
];

const kitsStateMachine = new StateMachine({
  name: 'kits',
  initialState: 'REQUESTED',
  states: STATES,
  transitions: TRANSITIONS,
});

module.exports = { kitsStateMachine, KITS_STATES: STATES };
