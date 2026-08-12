'use strict';

const { db } = require('../index');

/**
 * Invitaciones de acceso.
 *
 * La base guarda el HASH del token, nunca el token: un volcado no permite
 * activar ninguna cuenta. Por eso `token_hash` no sale de este modulo hacia
 * arriba —ninguna proyeccion lo incluye— y la busqueda se hace por hash, no
 * por identificador.
 */

/** Lo que puede salir de aqui. Deliberadamente sin `token_hash`. */
const FIELDS = `
  id, user_id, channel, expires_at, accepted_at, revoked_at, created_by, created_at
`;

async function create({ userId, tokenHash, channel, expiresAt, createdBy }, tx = db) {
  return tx.one(
    `INSERT INTO user_invitations (user_id, token_hash, channel, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${FIELDS}`,
    [userId, tokenHash, channel, expiresAt, createdBy ?? null],
  );
}

/**
 * Invalida las invitaciones vivas de una persona.
 *
 * Se llama antes de emitir una nueva: generar un enlace nuevo tiene que dejar
 * inservible el anterior, porque si no un enlace filtrado seguiria abriendo la
 * cuenta indefinidamente.
 */
async function revokePending(userId, tx = db) {
  return tx.result(
    `UPDATE user_invitations SET revoked_at = NOW()
      WHERE user_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [userId],
    (result) => result.rowCount,
  );
}

/**
 * Busca por hash del token, con el usuario asociado.
 *
 * Devuelve la fila aunque este vencida o usada: quien decide es el servicio,
 * que necesita distinguir "no existe" de "caduco" para el mensaje, y responde
 * lo mismo hacia fuera en ambos casos.
 */
async function findByTokenHash(tokenHash, tx = db) {
  return tx.oneOrNone(
    `SELECT i.id, i.user_id, i.channel, i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
            u.email, u.first_name, u.last_name, u.status
       FROM user_invitations i
       JOIN users u ON u.id = i.user_id
      WHERE i.token_hash = $1`,
    [tokenHash],
  );
}

async function markAccepted(id, tx = db) {
  return tx.oneOrNone(
    `UPDATE user_invitations SET accepted_at = NOW()
      WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
      RETURNING ${FIELDS}`,
    [id],
  );
}

/** Invitacion viva de una persona, si la hay. Sirve para pintar su estado. */
async function findPendingForUser(userId, tx = db) {
  return tx.oneOrNone(
    `SELECT ${FIELDS} FROM user_invitations
      WHERE user_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId],
  );
}

/** Ultima invitacion de cada persona de la lista, para los listados. */
async function findLatestForUsers(userIds, tx = db) {
  if (!userIds?.length) return [];
  return tx.any(
    `SELECT DISTINCT ON (user_id) ${FIELDS}
       FROM user_invitations
      WHERE user_id = ANY($1)
      ORDER BY user_id, created_at DESC`,
    [userIds],
  );
}

module.exports = {
  FIELDS,
  create,
  revokePending,
  findByTokenHash,
  markAccepted,
  findPendingForUser,
  findLatestForUsers,
};
