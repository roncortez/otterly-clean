'use strict';

const env = require('../config/env');

/**
 * Drivers de entrega.
 *
 * El dominio emite eventos; esta capa decide por donde salen. Cada canal tiene
 * su driver y cada driver responde dos preguntas:
 *
 *   isConfigured()  ¿hay un proveedor de verdad detras?
 *   send()          entregalo y di como fue
 *
 * Regla que no se negocia: **un canal sin proveedor no marca nada como
 * enviado**. La notificacion queda PENDING con el motivo, y el dia que exista
 * el proveedor puede reprocesarse. Marcar SENT lo que nadie envio convierte la
 * bitacora en una mentira y hace imposible detectar que un aviso no llego.
 *
 * Anadir WhatsApp Cloud API, Twilio o un proveedor de correo es escribir un
 * driver aqui: ni el dominio ni las rutas se enteran.
 */

/** Desarrollo: imprime y da por entregado. Solo para lo que se ve en la app. */
const consoleDriver = {
  isConfigured: () => true,
  async send(notification) {
    console.log(
      `[notificacion:${notification.channel}] -> usuario ${notification.user_id}: ` +
        `${notification.title} — ${notification.body}`,
    );
    return { status: 'SENT' };
  },
};

/** Solo persiste; util para entornos donde no se quiere ruido. */
const silentDriver = {
  isConfigured: () => true,
  async send() {
    return { status: 'SKIPPED' };
  },
};

/**
 * Canal sin proveedor todavia.
 *
 * No falla y no miente: deja la notificacion pendiente con el motivo. El
 * mensaje real (por ejemplo, el enlace de activacion) llega al driver por el
 * contexto en memoria y nunca se guarda en la base.
 */
function pendingDriver(reason) {
  return {
    isConfigured: () => false,
    async send() {
      return { status: 'PENDING', error: reason };
    },
  };
}

const IN_APP_DRIVERS = { console: consoleDriver, none: silentDriver };

const CHANNEL_DRIVERS = {
  IN_APP: () => IN_APP_DRIVERS[env.notifications.driver] ?? silentDriver,
  // Preparados, sin proveedor configurado. El contrato ya existe: cuando se
  // integre uno, solo cambia lo que devuelve esta funcion.
  EMAIL: () => pendingDriver('EMAIL_DRIVER_NOT_CONFIGURED'),
  WHATSAPP: () => pendingDriver('WHATSAPP_DRIVER_NOT_CONFIGURED'),
  SMS: () => pendingDriver('SMS_DRIVER_NOT_CONFIGURED'),
  PUSH: () => pendingDriver('PUSH_DRIVER_NOT_CONFIGURED'),
};

/** Driver del canal, o uno que no entrega nada si el canal es desconocido. */
function resolve(channel) {
  const factory = CHANNEL_DRIVERS[channel];
  return factory ? factory() : pendingDriver('UNKNOWN_CHANNEL');
}

/** Canales con proveedor real ahora mismo. Lo consulta la capa de invitaciones. */
function deliverableChannels(channels) {
  return channels.filter((channel) => resolve(channel).isConfigured());
}

module.exports = { resolve, deliverableChannels };
