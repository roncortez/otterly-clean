'use strict';

const { db } = require('../db');
const env = require('../config/env');
const { EVENTS, AUDIENCE, eventForStatus } = require('./events');

/**
 * Servicio de notificaciones.
 *
 * El dominio dispara eventos ("el profesional llego"), no mensajes. Esta capa
 * decide destinatarios, canales y textos, persiste cada notificacion y delega
 * el envio a un driver.
 *
 * Hoy solo existe el driver de consola: toda notificacion queda registrada en
 * la tabla `notifications` y se imprime en el log. Anadir email, SMS o push es
 * registrar un driver mas en DRIVERS, sin tocar el dominio ni las rutas.
 */

const DRIVERS = {
  /** Desarrollo: imprime y marca como enviada. */
  console: {
    async send(notification) {
      console.log(
        `[notificacion:${notification.channel}] -> usuario ${notification.user_id}: ` +
          `${notification.title} — ${notification.body}`,
      );
      return { status: 'SENT' };
    },
  },
  /** Solo persiste; util para entornos donde no se quiere ruido. */
  none: {
    async send() {
      return { status: 'SKIPPED' };
    },
  },
};

function getDriver() {
  return DRIVERS[env.notifications.driver] ?? DRIVERS.none;
}

/**
 * Resuelve los usuarios que deben recibir un evento.
 * OPS se expande a todos los administradores activos.
 */
async function resolveRecipients(audiences, context, tx) {
  const recipients = [];

  for (const audience of audiences) {
    if (audience === AUDIENCE.CUSTOMER && context.customerId) {
      recipients.push({ userId: context.customerId, audience });
    }
    if (audience === AUDIENCE.STAFF && context.staffId) {
      recipients.push({ userId: context.staffId, audience });
    }
    if (audience === AUDIENCE.OPS) {
      const admins = await tx.any(
        "SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'",
      );
      recipients.push(...admins.map((a) => ({ userId: a.id, audience })));
    }
  }

  // Evita duplicados cuando un mismo usuario cae en dos audiencias.
  const seen = new Set();
  return recipients.filter((r) => {
    const key = `${r.userId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Emite un evento de notificacion.
 *
 * Nunca lanza: un fallo notificando no debe tumbar la operacion de negocio que
 * lo origino (marcar "llegue" tiene que funcionar aunque el email falle).
 *
 * @param {string} eventCode
 * @param {object} context {reference, customerId, staffId, orderId, staffName}
 * @param {object} [tx] transaccion pg-promise
 */
async function emit(eventCode, context, tx = db) {
  try {
    const event = EVENTS[eventCode];
    if (!event) {
      console.warn(`[notificaciones] evento desconocido: ${eventCode}`);
      return [];
    }

    const { title, body } = event.template(context);
    const recipients = await resolveRecipients(event.audience, context, tx);
    const driver = getDriver();
    const created = [];

    for (const recipient of recipients) {
      for (const channel of event.channels) {
        // Solo IN_APP se "envia" de verdad hoy. El resto queda persistido como
        // PENDING para que el driver real lo procese cuando exista.
        const isDeliverable = channel === 'IN_APP';

        const row = await tx.one(
          `INSERT INTO notifications
             (user_id, order_id, event, channel, title, body, payload, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7:json, 'PENDING')
           RETURNING *`,
          [
            recipient.userId,
            context.orderId ?? null,
            eventCode,
            channel,
            title,
            body,
            { reference: context.reference ?? null },
          ],
        );

        if (isDeliverable) {
          const result = await driver.send(row);
          await tx.none(
            'UPDATE notifications SET status = $1, sent_at = NOW() WHERE id = $2',
            [result.status, row.id],
          );
        }
        created.push(row);
      }
    }

    return created;
  } catch (error) {
    console.error(`[notificaciones] fallo emitiendo ${eventCode}:`, error.message);
    return [];
  }
}

/** Notificaciones in-app de un usuario. */
async function listForUser(userId, { limit = 30, unreadOnly = false } = {}) {
  return db.any(
    `SELECT id, order_id, event, title, body, payload, read_at, created_at
       FROM notifications
      WHERE user_id = $1 AND channel = 'IN_APP'
        ${unreadOnly ? 'AND read_at IS NULL' : ''}
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
}

async function markRead(userId, notificationId) {
  return db.oneOrNone(
    `UPDATE notifications SET read_at = NOW()
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL
      RETURNING id`,
    [notificationId, userId],
  );
}

module.exports = { emit, listForUser, markRead, eventForStatus };
