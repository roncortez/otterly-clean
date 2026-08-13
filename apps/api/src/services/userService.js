'use strict';

const { db } = require('../db');
const userRepository = require('../db/repositories/userRepository');
const staffRepo = require('../db/repositories/staffRepository');
const authService = require('./authService');
const audit = require('./auditService');
const { ROLES, normalizeRoles } = require('../domain/shared/roles');
const { NotFoundError, ConflictError, ValidationError } = require('../domain/errors');

/**
 * Usuarios y roles.
 *
 * Solo un administrador llega hasta aqui: las rutas cuelgan de /api/operations.
 * El registro publico no pasa por este modulo y nunca puede otorgar un rol.
 */

/**
 * Impide dejar el sistema sin administrador.
 *
 * Sin esta comprobacion, un ADMIN puede quitarse el rol a si mismo o
 * desactivar al ultimo companero y dejar la instalacion sin nadie capaz de
 * entrar a Operaciones: no habria forma de recuperarla desde la aplicacion.
 *
 * Se ejecuta DENTRO de la transaccion del cambio para que dos peticiones
 * simultaneas no se den permiso la una a la otra.
 */
async function assertNotLastActiveAdmin(userId, tx = db) {
  const remaining = await userRepository.countActiveAdmins({ excludeUserId: userId }, tx);
  if (remaining === 0) {
    throw new ConflictError(
      'No puedes dejar el sistema sin administradores activos. Asigna el rol ADMIN a otra persona primero.',
      { reason: 'LAST_ADMIN' },
    );
  }
}

/** ¿Este cambio deja a la persona sin el rol ADMIN que tenia? */
function losesAdmin(previousRoles, nextRoles) {
  return previousRoles.includes(ROLES.ADMIN) && !nextRoles.includes(ROLES.ADMIN);
}

async function list(filters) {
  return userRepository.list(filters);
}

async function getById(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Usuario', userId);
  return user;
}

/**
 * Reemplaza el conjunto de roles de una persona.
 *
 * Se recibe la lista completa y no operaciones "agregar/quitar": asi el estado
 * final es explicito y dos administradores editando a la vez no acaban con un
 * resultado que ninguno pidio.
 */
async function updateRoles({ userId, roles, actor, request }) {
  const nextRoles = normalizeRoles(roles);
  if (nextRoles.length === 0) {
    throw new ValidationError('Debes asignar al menos un rol', [
      { path: 'roles', message: 'Debes asignar al menos un rol' },
    ]);
  }

  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Usuario', userId);

  const previousRoles = user.roles;

  return db.tx(async (tx) => {
    if (losesAdmin(previousRoles, nextRoles)) {
      await assertNotLastActiveAdmin(userId, tx);
    }

    await userRepository.setRoles(userId, nextRoles, actor.id, tx);

    // Un STAFF sin perfil operativo no puede recibir asignaciones. Al conceder
    // el rol se crea la ficha vacia; al retirarlo NO se borra, porque las
    // ordenes historicas siguen citando a esa persona.
    if (nextRoles.includes(ROLES.STAFF)) {
      await staffRepo.ensureProfile(userId, { displayName: user.first_name }, tx);
    }

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.USER_ROLES_UPDATED,
        entityType: 'user',
        entityId: userId,
        before: { roles: previousRoles },
        after: { roles: nextRoles },
        metadata: { email: user.email },
        request,
      },
      tx,
    );

    return userRepository.findById(userId, tx);
  });
}

/**
 * Activa o desactiva una cuenta. Desactivar revoca las sesiones abiertas: un
 * token vigente no debe sobrevivir a la baja.
 */
async function setStatus({ userId, active, actor, request }) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Usuario', userId);

  const status = active ? 'ACTIVE' : 'INACTIVE';

  return db.tx(async (tx) => {
    if (!active) {
      await assertNotLastActiveAdmin(userId, tx);
    }

    await userRepository.update(userId, { status }, tx);

    // Si tambien es trabajador, su ficha operativa acompana al estado de la
    // cuenta: no debe seguir apareciendo como candidato para asignaciones.
    if (user.roles.includes(ROLES.STAFF)) {
      await staffRepo.updateProfile(userId, { active }, tx);
    }

    if (!active) {
      await authService.revokeAllSessions(userId, tx);
    }

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.USER_STATUS_CHANGED,
        entityType: 'user',
        entityId: userId,
        before: { status: user.status },
        after: { status },
        metadata: { email: user.email },
        request,
      },
      tx,
    );

    return userRepository.findById(userId, tx);
  });
}

module.exports = { assertNotLastActiveAdmin, list, getById, updateRoles, setStatus };
