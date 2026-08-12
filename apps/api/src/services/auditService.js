'use strict';

const { db } = require('../db');

/**
 * Registro de auditoria.
 *
 * Responde a: quien asigno un trabajador, quien cambio un estado, quien
 * cancelo, quien reporto una incidencia y cuando ocurrio cada cosa.
 *
 * Se escribe dentro de la misma transaccion que la operacion auditada cuando
 * se pasa `tx`, de modo que no puede existir un cambio sin su rastro.
 */

const ACTIONS = Object.freeze({
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_UPDATED: 'ORDER_UPDATED',
  STAFF_ASSIGNED: 'STAFF_ASSIGNED',
  STAFF_REASSIGNED: 'STAFF_REASSIGNED',
  ASSIGNMENT_ACCEPTED: 'ASSIGNMENT_ACCEPTED',
  ASSIGNMENT_DECLINED: 'ASSIGNMENT_DECLINED',
  INCIDENT_REPORTED: 'INCIDENT_REPORTED',
  INCIDENT_RESOLVED: 'INCIDENT_RESOLVED',
  ACCESS_SECRET_VIEWED: 'ACCESS_SECRET_VIEWED',
  STAFF_CREATED: 'STAFF_CREATED',
  STAFF_UPDATED: 'STAFF_UPDATED',
  STAFF_DEACTIVATED: 'STAFF_DEACTIVATED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
  // Configuracion administrable de la plataforma.
  USER_ROLES_UPDATED: 'USER_ROLES_UPDATED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  COMPANY_SETTINGS_UPDATED: 'COMPANY_SETTINGS_UPDATED',
  SERVICE_CONFIGURATION_UPDATED: 'SERVICE_CONFIGURATION_UPDATED',
  SERVICE_PLAN_UPDATED: 'SERVICE_PLAN_UPDATED',
  BOOKING_BLACKOUT_CREATED: 'BOOKING_BLACKOUT_CREATED',
  BOOKING_BLACKOUT_UPDATED: 'BOOKING_BLACKOUT_UPDATED',
  BOOKING_BLACKOUT_DELETED: 'BOOKING_BLACKOUT_DELETED',
  MEDIA_UPLOADED: 'MEDIA_UPLOADED',
  MEDIA_DELETED: 'MEDIA_DELETED',
});

/**
 * @param {object} entry
 * @param {object|null} entry.actor    usuario que ejecuta la accion
 * @param {string} entry.action        una de ACTIONS
 * @param {string} entry.entityType    'order' | 'user' | 'assignment' | ...
 * @param {string|number} entry.entityId
 * @param {object} [entry.before]      estado previo relevante
 * @param {object} [entry.after]       estado nuevo relevante
 * @param {object} [entry.metadata]
 * @param {object} [entry.request]     req de express, para ip y user-agent
 * @param {object} [tx]                transaccion pg-promise; si falta, usa db
 */
async function record(entry, tx = db) {
  const {
    actor = null,
    action,
    entityType,
    entityId,
    before = null,
    after = null,
    metadata = {},
    request = null,
  } = entry;

  await tx.none(
    `INSERT INTO audit_log
       (actor_id, actor_role, action, entity_type, entity_id, before, after, metadata, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6:json, $7:json, $8:json, $9, $10)`,
    [
      actor?.id ?? null,
      actor?.role ?? null,
      action,
      entityType,
      entityId === null || entityId === undefined ? null : String(entityId),
      before,
      after,
      metadata,
      request?.ip ?? null,
      request?.get?.('user-agent') ?? null,
    ],
  );
}

/** Historial de auditoria de una entidad, mas reciente primero. */
async function listForEntity(entityType, entityId, { limit = 50 } = {}) {
  return db.any(
    `SELECT a.*, u.first_name, u.last_name, u.email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.entity_type = $1 AND a.entity_id = $2
      ORDER BY a.created_at DESC
      LIMIT $3`,
    [entityType, String(entityId), limit],
  );
}

module.exports = { ACTIONS, record, listForEntity };
