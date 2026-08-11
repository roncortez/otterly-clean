'use strict';

/**
 * Catalogo de eventos notificables.
 *
 * Cada evento declara a quien avisa y con que plantilla. Anadir un canal real
 * (email, SMS, push) no toca este archivo: solo se registra un driver nuevo.
 *
 * `audience`: CUSTOMER | STAFF | OPS
 */

const AUDIENCE = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  STAFF: 'STAFF',
  OPS: 'OPS',
});

/**
 * Las plantillas reciben el contexto de la orden y devuelven titulo y cuerpo.
 * Se mantienen en espanol; la version en ingles se resuelve por `locale`
 * cuando se active la region US (ver docs/ARCHITECTURE.md).
 */
const EVENTS = Object.freeze({
  ORDER_CREATED: {
    audience: [AUDIENCE.CUSTOMER, AUDIENCE.OPS],
    channels: ['IN_APP', 'EMAIL'],
    template: (ctx) => ({
      title: 'Solicitud recibida',
      body: `Recibimos tu solicitud ${ctx.reference}. Te confirmaremos el profesional asignado pronto.`,
    }),
  },
  ORDER_ASSIGNED: {
    audience: [AUDIENCE.CUSTOMER, AUDIENCE.STAFF],
    channels: ['IN_APP', 'PUSH'],
    template: (ctx) => ({
      title: 'Profesional asignado',
      body: `${ctx.staffName ?? 'Un profesional'} atendera tu servicio ${ctx.reference}.`,
    }),
  },
  ORDER_CONFIRMED: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP', 'PUSH'],
    template: (ctx) => ({
      title: 'Servicio confirmado',
      body: `${ctx.staffName ?? 'El profesional'} confirmo tu servicio ${ctx.reference}.`,
    }),
  },
  STAFF_ON_THE_WAY: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP', 'PUSH', 'SMS'],
    template: (ctx) => ({
      title: 'El profesional va en camino',
      body: `${ctx.staffName ?? 'El profesional'} se dirige a tu domicilio.`,
    }),
  },
  STAFF_ARRIVED: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP', 'PUSH'],
    template: (ctx) => ({
      title: 'El profesional llego',
      body: `${ctx.staffName ?? 'El profesional'} llego a tu domicilio.`,
    }),
  },
  SERVICE_STARTED: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP', 'PUSH'],
    template: (ctx) => ({
      title: 'Servicio iniciado',
      body: `Tu servicio ${ctx.reference} esta en progreso.`,
    }),
  },
  SERVICE_COMPLETED: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    template: (ctx) => ({
      title: 'Servicio finalizado',
      body: `Tu servicio ${ctx.reference} fue completado. Gracias por confiar en nosotros.`,
    }),
  },
  ORDER_CANCELLED: {
    audience: [AUDIENCE.CUSTOMER, AUDIENCE.STAFF, AUDIENCE.OPS],
    channels: ['IN_APP', 'EMAIL'],
    template: (ctx) => ({
      title: 'Servicio cancelado',
      body: `El servicio ${ctx.reference} fue cancelado.`,
    }),
  },
  INCIDENT_REPORTED: {
    audience: [AUDIENCE.OPS, AUDIENCE.CUSTOMER],
    channels: ['IN_APP', 'EMAIL'],
    template: (ctx) => ({
      title: 'Incidencia reportada',
      body: `Se reporto una incidencia en el servicio ${ctx.reference}.`,
    }),
  },

  // --- Lavanderia --------------------------------------------------------
  LAUNDRY_PICKED_UP: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP', 'PUSH'],
    template: (ctx) => ({
      title: 'Recogida realizada',
      body: `Recogimos tu ropa (${ctx.reference}). Te avisaremos cuando llegue a planta.`,
    }),
  },
  LAUNDRY_RECEIVED: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP'],
    template: (ctx) => ({
      title: 'Ropa recibida',
      body: `Tu pedido ${ctx.reference} llego a nuestra planta y sera procesado.`,
    }),
  },
  LAUNDRY_PROCESSING: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP'],
    template: (ctx) => ({
      title: 'Ropa en proceso',
      body: `Estamos procesando tu pedido ${ctx.reference}.`,
    }),
  },
  LAUNDRY_READY: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP', 'PUSH'],
    template: (ctx) => ({
      title: 'Ropa lista',
      body: `Tu pedido ${ctx.reference} esta listo y sera enviado a tu domicilio.`,
    }),
  },
  LAUNDRY_OUT_FOR_DELIVERY: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP', 'PUSH', 'SMS'],
    template: (ctx) => ({
      title: 'Pedido en camino',
      body: `Tu pedido ${ctx.reference} va en camino a tu domicilio.`,
    }),
  },
  LAUNDRY_DELIVERED: {
    audience: [AUDIENCE.CUSTOMER],
    channels: ['IN_APP', 'PUSH', 'EMAIL'],
    template: (ctx) => ({
      title: 'Pedido entregado',
      body: `Entregamos tu pedido ${ctx.reference}. Gracias por confiar en nosotros.`,
    }),
  },
});

/**
 * Mapa estado -> evento. Permite que el cambio de estado dispare la
 * notificacion correcta sin que el servicio de ordenes conozca los textos.
 */
const STATUS_EVENTS = Object.freeze({
  CLEANING: {
    ASSIGNED: 'ORDER_ASSIGNED',
    CONFIRMED: 'ORDER_CONFIRMED',
    ON_THE_WAY: 'STAFF_ON_THE_WAY',
    ARRIVED: 'STAFF_ARRIVED',
    IN_PROGRESS: 'SERVICE_STARTED',
    COMPLETED: 'SERVICE_COMPLETED',
    CANCELLED: 'ORDER_CANCELLED',
    INCIDENT_REPORTED: 'INCIDENT_REPORTED',
    NO_ACCESS: 'INCIDENT_REPORTED',
  },
  LAUNDRY: {
    ASSIGNED: 'ORDER_ASSIGNED',
    PICKUP_CONFIRMED: 'ORDER_CONFIRMED',
    PICKED_UP: 'LAUNDRY_PICKED_UP',
    RECEIVED: 'LAUNDRY_RECEIVED',
    PROCESSING: 'LAUNDRY_PROCESSING',
    READY_FOR_DELIVERY: 'LAUNDRY_READY',
    OUT_FOR_DELIVERY: 'LAUNDRY_OUT_FOR_DELIVERY',
    DELIVERED: 'LAUNDRY_DELIVERED',
    COMPLETED: 'SERVICE_COMPLETED',
    CANCELLED: 'ORDER_CANCELLED',
    ISSUE_REPORTED: 'INCIDENT_REPORTED',
  },
});

function eventForStatus(serviceType, status) {
  return STATUS_EVENTS[serviceType]?.[status] ?? null;
}

module.exports = { EVENTS, AUDIENCE, STATUS_EVENTS, eventForStatus };
