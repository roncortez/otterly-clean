'use strict';

const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { db } = require('../db');
const invitationRepo = require('../db/repositories/invitationRepository');
const userRepository = require('../db/repositories/userRepository');
const companyService = require('./companyService');
const audit = require('./auditService');
const notifications = require('../notifications');
const { hashToken, randomToken } = require('./crypto');
const { NotFoundError, ForbiddenError } = require('../domain/errors');

/**
 * Invitaciones para activar una cuenta.
 *
 * El ADMIN crea la cuenta del trabajador pero NO su contrasena: se le envia un
 * enlace de un solo uso con el que la persona elige su clave y arranca su
 * onboarding. Asi ninguna credencial permanente viaja por correo o WhatsApp, y
 * la contrasena del trabajador no la conoce nadie mas que el.
 *
 * Del token, la base solo guarda el hash. El token en claro existe una sola vez
 * —en el enlace— y no se persiste en ningun sitio, tampoco en `notifications`.
 */

/** Longitud del token: 32 bytes -> 64 hex. Sobra entropia para descartar fuerza bruta. */
const TOKEN_BYTES = 32;

/** Canales por los que se intenta entregar, en orden de preferencia del negocio. */
const CHANNELS = Object.freeze(['WHATSAPP', 'EMAIL']);

function expiryDate() {
  return new Date(Date.now() + env.auth.invitationTtlHours * 3600 * 1000);
}

function activationUrl(token) {
  return `${env.appUrl}/activar-cuenta?token=${token}`;
}

/**
 * Proyeccion publica de una invitacion.
 * Nunca sale el hash ni el token: solo cuando expira y en que estado esta.
 */
function projectInvitation(invitation) {
  if (!invitation) return null;

  const expired = new Date(invitation.expires_at).getTime() <= Date.now();
  const status = invitation.accepted_at
    ? 'ACCEPTED'
    : invitation.revoked_at
      ? 'REVOKED'
      : expired
        ? 'EXPIRED'
        : 'PENDING';

  return {
    id: invitation.id,
    status,
    channel: invitation.channel,
    expiresAt: invitation.expires_at,
    acceptedAt: invitation.accepted_at,
    createdAt: invitation.created_at,
  };
}

/**
 * Emite una invitacion y la entrega.
 *
 * Generar una nueva revoca la anterior dentro de la misma transaccion: en todo
 * momento hay como mucho un enlace utilizable por persona, asi que un enlace
 * antiguo filtrado deja de servir en cuanto se reenvia la invitacion.
 *
 * @returns {{invitation, activationUrl, delivery}} `activationUrl` solo se
 *   devuelve a quien la genera. Mientras no exista un proveedor real de correo
 *   o WhatsApp, es la unica forma de hacer llegar el enlace, y quien invita ya
 *   puede reenviarlo cuando quiera.
 */
async function invite({ userId, actor, request, tx = null }) {
  const run = async (t) => {
    const user = await userRepository.findById(userId, t);
    if (!user) throw new NotFoundError('Usuario', userId);

    await invitationRepo.revokePending(userId, t);

    const token = randomToken(TOKEN_BYTES);
    const invitation = await invitationRepo.create(
      {
        userId,
        tokenHash: hashToken(token),
        // El canal es la intencion, no la garantia: si WhatsApp no tiene
        // proveedor, la notificacion queda pendiente y se ve como tal.
        channel: notifications.drivers.resolve('WHATSAPP').isConfigured() ? 'WHATSAPP' : 'EMAIL',
        expiresAt: expiryDate(),
        createdBy: actor?.id ?? null,
      },
      t,
    );

    const company = await companyService.getPublic();
    const delivered = await notifications.emit(
      'STAFF_INVITED',
      {
        staffId: userId,
        companyName: company?.name,
        expiresInHours: env.auth.invitationTtlHours,
        // Solo en memoria: llega al driver y no se guarda en ninguna tabla.
        activationUrl: activationUrl(token),
      },
      t,
    );

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.USER_INVITED,
        entityType: 'user',
        entityId: userId,
        after: { channel: invitation.channel, expiresAt: invitation.expires_at },
        metadata: { email: user.email },
        request,
      },
      t,
    );

    return {
      invitation: projectInvitation(invitation),
      activationUrl: activationUrl(token),
      delivery: delivered.map((notification) => ({
        channel: notification.channel,
        status: notification.status,
        reason: notification.error ?? null,
      })),
    };
  };

  return tx ? run(tx) : db.tx(run);
}

/**
 * Comprueba un token sin consumirlo.
 *
 * La pantalla de activacion la usa para saber si merece la pena pedir la
 * contrasena. La respuesta es deliberadamente pobre: nombre de pila y poco
 * mas. Un token invalido y uno vencido responden lo mismo hacia fuera —404—
 * para no convertir esta ruta en un oraculo de correos registrados.
 */
async function validateToken(token, tx = db) {
  const invitation = await invitationRepo.findByTokenHash(hashToken(String(token ?? '')), tx);

  if (
    !invitation ||
    invitation.accepted_at ||
    invitation.revoked_at ||
    new Date(invitation.expires_at).getTime() <= Date.now()
  ) {
    throw new NotFoundError('Invitación', null);
  }

  return invitation;
}

/**
 * Acepta la invitacion: la persona elige su contrasena y queda dentro.
 *
 * Consume el token (un solo uso) y deja la cuenta lista para el onboarding. Se
 * hace todo en una transaccion para que no exista un instante con la
 * contrasena puesta y la invitacion todavia utilizable.
 */
async function accept({ token, password, request, userAgent }) {
  // Se valida fuera de la transaccion para no abrirla si el token no sirve.
  await validateToken(token);

  // Se requiere aqui y no arriba: authService depende de este modulo para el
  // login del recien activado, y el require circular en carga romperia.
  const authService = require('./authService');

  return db.tx(async (tx) => {
    // Se relee dentro de la transaccion: entre la comprobacion y el consumo
    // alguien pudo revocarla o usarla.
    const invitation = await validateToken(token, tx);
    const consumed = await invitationRepo.markAccepted(invitation.id, tx);
    if (!consumed) throw new NotFoundError('Invitación', null);

    // El estado de la cuenta lo decide Operaciones, y aceptar una invitacion no
    // puede cambiarlo: si alguien dio de alta la cuenta desactivada, activarla
    // sola seria dejar que una accion del usuario revierta una decision
    // administrativa. Se aborta la transaccion entera, asi que el enlace sigue
    // sirviendo para cuando la empresa la habilite.
    if (invitation.status !== 'ACTIVE') {
      throw new ForbiddenError(
        'Tu cuenta todavía no está habilitada. Contacta con la empresa y vuelve a abrir este enlace.',
      );
    }

    const passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds);
    await userRepository.updatePassword(invitation.user_id, passwordHash, tx);

    // Cualquier sesion previa deja de valer: la cuenta acaba de cambiar de
    // dueno efectivo.
    await tx.none(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [invitation.user_id],
    );

    await audit.record(
      {
        actor: { id: invitation.user_id, role: null },
        action: audit.ACTIONS.USER_INVITATION_ACCEPTED,
        entityType: 'user',
        entityId: invitation.user_id,
        request,
      },
      tx,
    );

    const user = await userRepository.findById(invitation.user_id, tx);
    return authService.buildSession(user, { userAgent, request }, tx);
  });
}

/** Estado de la invitacion de una persona, para las pantallas de Operaciones. */
async function statusForUser(userId, tx = db) {
  return projectInvitation(await invitationRepo.findPendingForUser(userId, tx));
}

module.exports = {
  CHANNELS,
  invite,
  accept,
  validateToken,
  statusForUser,
  projectInvitation,
  activationUrl,
};
