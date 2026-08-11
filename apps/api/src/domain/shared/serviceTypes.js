'use strict';

const { cleaningStateMachine } = require('../cleaning/stateMachine');
const { laundryStateMachine } = require('../laundry/stateMachine');
const { DomainError } = require('../errors');

/**
 * Tipos de servicio de la plataforma.
 *
 * ALTERATION (arreglo de prendas) existe en el dominio desde el primer dia
 * pero esta deshabilitado: no tiene maquina de estados ni flujo de reserva
 * todavia. Declararlo aqui garantiza que el modelo de datos, la API y la capa
 * de operaciones ya lo contemplen, de modo que activarlo despues sea anadir su
 * maquina de estados y su tabla de detalle, no rehacer el sistema.
 */
const SERVICE_TYPES = Object.freeze({
  CLEANING: 'CLEANING',
  LAUNDRY: 'LAUNDRY',
  ALTERATION: 'ALTERATION',
});

const SERVICE_DEFINITIONS = Object.freeze({
  CLEANING: {
    code: 'CLEANING',
    label: 'Limpieza residencial',
    description: 'Limpieza de casas, departamentos y oficinas a domicilio.',
    enabled: true,
    detailTable: 'cleaning_details',
    stateMachine: cleaningStateMachine,
    // El servicio ocurre en el domicilio del cliente: una sola direccion.
    addressModel: 'SINGLE',
  },
  LAUNDRY: {
    code: 'LAUNDRY',
    label: 'Lavanderia a domicilio',
    description: 'Recogida, lavado, secado, doblado y entrega a domicilio.',
    enabled: true,
    detailTable: 'laundry_details',
    stateMachine: laundryStateMachine,
    // Hay recogida y entrega: pueden ser direcciones distintas.
    addressModel: 'PICKUP_DELIVERY',
  },
  ALTERATION: {
    code: 'ALTERATION',
    label: 'Arreglo de prendas',
    description: 'Reparacion, ajuste, costura y cambio de cierres.',
    // Definido pero no ofrecido todavia. Ver docs/ARCHITECTURE.md.
    enabled: false,
    detailTable: 'alteration_details',
    stateMachine: null,
    addressModel: 'PICKUP_DELIVERY',
  },
});

function isServiceType(code) {
  return Object.hasOwn(SERVICE_DEFINITIONS, code);
}

function getServiceDefinition(code) {
  const definition = SERVICE_DEFINITIONS[code];
  if (!definition) {
    throw new DomainError('UNKNOWN_SERVICE_TYPE', `Tipo de servicio desconocido: ${code}`, {
      serviceType: code,
    });
  }
  return definition;
}

/** Tipos que un cliente puede reservar hoy. */
function enabledServiceTypes() {
  return Object.values(SERVICE_DEFINITIONS).filter((s) => s.enabled);
}

/**
 * Maquina de estados del tipo de servicio. Lanza si el servicio existe pero
 * aun no esta implementado, en lugar de devolver null silenciosamente.
 */
function getStateMachine(code) {
  const definition = getServiceDefinition(code);
  if (!definition.stateMachine) {
    throw new DomainError(
      'SERVICE_NOT_AVAILABLE',
      `El servicio ${definition.label} todavia no esta disponible`,
      { serviceType: code },
    );
  }
  return definition.stateMachine;
}

module.exports = {
  SERVICE_TYPES,
  SERVICE_DEFINITIONS,
  isServiceType,
  getServiceDefinition,
  enabledServiceTypes,
  getStateMachine,
};
