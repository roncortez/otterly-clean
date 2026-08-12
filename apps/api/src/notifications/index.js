'use strict';

const { db } = require('../db');
const drivers = require('./drivers');
const { EVENTS, AUDIENCE, eventForStatus } = require('./events');

/**
 * Servicio de notificaciones.
 *
 * El dominio dispara eventos ("el profesional llego"), no mensajes. Esta capa
 * decide destinatarios, canales y textos, persiste cada notificacion y delega
 * el envio al driver del canal (`./drivers`).
 *
 * Un canal sin proveedor configurado deja la notificacion PENDING con el
 * motivo, nunca SENT. Anadir email o WhatsApp de verdad es escribir su driver:
 * ni el dominio ni las rutas cambian.
 */

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
        `SELECT u.id FROM users u
           JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'ADMIN'
          WHERE u.status = 'ACTIVE'`,
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
 *   Puede llevar datos que NO deben persistirse (por ejemplo el enlace de
 *   activacion de una invitacion): el contexto llega al driver en memoria, la
 *   tabla solo guarda titulo, cuerpo y un payload minimo.
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
    const created = [];

    for (const recipient of recipients) {
      for (const channel of event.channels) {
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

        const driver = drivers.resolve(channel);
        // Sin proveedor no se toca el estado: queda PENDING con el motivo, para
        // que nadie confunda "encolado" con "entregado".
        const result = driver.isConfigured()
          ? await driver.send(row, context)
          : { status: 'PENDING', error: `${channel}_DRIVER_NOT_CONFIGURED` };

        if (result.status !== 'PENDING') {
          await tx.none(
            'UPDATE notifications SET status = $1, sent_at = NOW() WHERE id = $2',
            [result.status, row.id],
          );
        } else if (result.error) {
          await tx.none('UPDATE notifications SET error = $1 WHERE id = $2', [
            result.error,
            row.id,
          ]);
        }

        created.push({ ...row, status: result.status, error: result.error ?? null });
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

module.exports = { emit, listForUser, markRead, eventForStatus, drivers };
