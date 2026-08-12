'use strict';

const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { db } = require('../db');
const userRepository = require('../db/repositories/userRepository');
const staffRepo = require('../db/repositories/staffRepository');
const customerRepo = require('../db/repositories/customerRepository');
const invitationRepo = require('../db/repositories/invitationRepository');
const invitationService = require('./invitationService');
const audit = require('./auditService');
const { assertNotLastActiveAdmin } = require('./userService');
const { ROLES, normalizeRoles } = require('../domain/shared/roles');
const { randomToken } = require('./crypto');
const { ConflictError, NotFoundError } = require('../domain/errors');

/**
 * Gestion de trabajadores.
 *
 * Las cuentas STAFF NO se crean por registro publico: las crea Operaciones.
 * Ese es justamente el punto que diferencia esta plataforma de un marketplace
 * abierto, y por eso vive aqui y no en authService.
 *
 * Lo que Operaciones aporta es lo que solo la empresa sabe: a quien contrata,
 * que servicios puede atender, en que zonas y si la cuenta esta activa. Los
 * datos personales —como se presenta, su biografia, su foto— los pone despues
 * el propio trabajador en su onboarding, porque son suyos y porque nadie los
 * escribe mejor que el.
 */

async function createStaff({ payload, actor, request }) {
  const existing = await userRepository.findByEmail(payload.email);
  if (existing) throw new ConflictError('Ya existe una cuenta con ese correo', { field: 'email' });

  const roles = normalizeRoles(payload.roles?.length ? payload.roles : [ROLES.STAFF]);
  const active = payload.active ?? true;

  const result = await db.tx(async (tx) => {
    // La cuenta nace SIN contrasena utilizable: se guarda el hash de un valor
    // aleatorio que nadie conoce, ni siquiera quien la crea. Solo la invitacion
    // permite fijar una clave, asi que no existe una credencial inicial que
    // pueda filtrarse por correo, por WhatsApp o por la memoria de un ADMIN.
    const passwordHash = await bcrypt.hash(randomToken(32), env.auth.bcryptRounds);

    const user = await userRepository.create(
      {
        email: payload.email,
        passwordHash,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        roles,
        regionCode: payload.regionCode ?? env.defaultRegion,
        locale: payload.locale ?? 'es',
        status: active ? 'ACTIVE' : 'INACTIVE',
      },
      tx,
    );

    await staffRepo.createProfile(
      {
        userId: user.id,
        employeeCode: payload.employeeCode,
        // Provisional hasta que el trabajador elija como quiere presentarse.
        displayName: payload.firstName,
        hiredAt: payload.hiredAt,
        serviceTypes: payload.serviceTypes ?? [],
      },
      tx,
    );

    if (!active) {
      await staffRepo.updateProfile(user.id, { active: false }, tx);
    }

    if (roles.includes(ROLES.CUSTOMER)) {
      await customerRepo.ensure(user.id, tx);
    }

    if (payload.zoneIds?.length) {
      await staffRepo.setZones(user.id, payload.zoneIds, tx);
    }

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.STAFF_CREATED,
        entityType: 'user',
        entityId: user.id,
        after: { email: user.email, roles, serviceTypes: payload.serviceTypes, active },
        request,
      },
      tx,
    );

    // La invitacion se emite en la misma transaccion: una cuenta sin forma de
    // entrar y sin invitacion seria una cuenta muerta que alguien tendria que
    // recordar arreglar a mano.
    const invitation = await invitationService.invite({ userId: user.id, actor, request, tx });

    return {
      staff: await staffRepo.findAdminProfile(user.id, tx),
      invitation,
    };
  });

  return result;
}

async function updateStaff({ staffId, payload, actor, request }) {
  const before = await staffRepo.findAdminProfile(staffId);
  if (!before) throw new NotFoundError('Trabajador', staffId);

  return db.tx(async (tx) => {
    const userFields = {};
    if (payload.firstName !== undefined) userFields.first_name = payload.firstName;
    if (payload.lastName !== undefined) userFields.last_name = payload.lastName;
    if (payload.phone !== undefined) userFields.phone = payload.phone;
    if (Object.keys(userFields).length > 0) {
      await userRepository.update(staffId, userFields, tx);
    }

    const profileFields = {};
    // Solo lo administrativo. La presentacion del trabajador —nombre publico,
    // biografia, habilidades y foto— es suya y se edita desde /api/me/profile:
    // que no aparezca aqui no es un olvido, es la separacion de responsabilidades.
    const map = {
      employeeCode: 'employee_code',
      hiredAt: 'hired_at',
      serviceTypes: 'service_types',
      backgroundCheckStatus: 'background_check_status',
    };
    for (const [key, column] of Object.entries(map)) {
      if (payload[key] !== undefined) profileFields[column] = payload[key];
    }
    if (Object.keys(profileFields).length > 0) {
      await staffRepo.updateProfile(staffId, profileFields, tx);
    }

    if (payload.zoneIds !== undefined) {
      await staffRepo.setZones(staffId, payload.zoneIds, tx);
    }

    const after = await staffRepo.findAdminProfile(staffId, tx);

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.STAFF_UPDATED,
        entityType: 'user',
        entityId: staffId,
        before: { serviceTypes: before.service_types, active: before.active },
        after: { serviceTypes: after.service_types, active: after.active },
        request,
      },
      tx,
    );

    return after;
  });
}

async function setVerification({ staffId, status, actor, request }) {
  const before = await staffRepo.findAdminProfile(staffId);
  if (!before) throw new NotFoundError('Trabajador', staffId);

  return db.tx(async (tx) => {
    const after = await staffRepo.setVerification(staffId, { status, verifiedBy: actor.id }, tx);
    await audit.record(
      {
        actor,
        action: audit.ACTIONS.STAFF_UPDATED,
        entityType: 'user',
        entityId: staffId,
        before: { verificationStatus: before.verification_status },
        after: { verificationStatus: status },
        request,
      },
      tx,
    );
    return after;
  });
}

/**
 * Desactivar en lugar de borrar: las ordenes historicas siguen citando al
 * trabajador y la trazabilidad no puede perderse.
 */
async function setActive({ staffId, active, actor, request }) {
  const before = await staffRepo.findAdminProfile(staffId);
  if (!before) throw new NotFoundError('Trabajador', staffId);

  return db.tx(async (tx) => {
    // Alguien puede ser STAFF y ADMIN a la vez: desactivarlo por la pantalla de
    // trabajadores tambien le quitaria el acceso a Operaciones. Si es el ultimo
    // administrador activo, el sistema se quedaria sin nadie que pueda entrar.
    if (!active) {
      await assertNotLastActiveAdmin(staffId, tx);
    }

    await staffRepo.updateProfile(staffId, { active }, tx);
    await userRepository.update(staffId, { status: active ? 'ACTIVE' : 'INACTIVE' }, tx);

    if (!active) {
      // Cerrar sesiones abiertas al desactivar.
      await tx.none(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [staffId],
      );
    }

    await audit.record(
      {
        actor,
        action: active ? audit.ACTIONS.STAFF_UPDATED : audit.ACTIONS.STAFF_DEACTIVATED,
        entityType: 'user',
        entityId: staffId,
        before: { active: before.active },
        after: { active },
        request,
      },
      tx,
    );

    return staffRepo.findAdminProfile(staffId, tx);
  });
}

/**
 * Reenvia la invitacion.
 *
 * Genera un enlace nuevo e invalida el anterior. Sirve tanto para el que se
 * perdio como para el que caduco, asi que no hay dos caminos distintos que
 * mantener.
 */
async function reinvite({ staffId, actor, request }) {
  const staff = await staffRepo.findAdminProfile(staffId);
  if (!staff) throw new NotFoundError('Trabajador', staffId);

  return invitationService.invite({ userId: staffId, actor, request });
}

/**
 * Listado con el estado de la invitacion de cada persona, para que Operaciones
 * vea de un vistazo quien todavia no ha activado su cuenta.
 */
async function list(filters) {
  const staff = await staffRepo.list(filters);
  if (staff.length === 0) return staff;

  const invitations = await invitationRepo.findLatestForUsers(staff.map((member) => member.id));
  const byUser = new Map(invitations.map((invitation) => [String(invitation.user_id), invitation]));

  return staff.map((member) => ({
    ...member,
    invitation: invitationService.projectInvitation(byUser.get(String(member.id))),
  }));
}

async function getAdminProfile(staffId) {
  const profile = await staffRepo.findAdminProfile(staffId);
  if (!profile) throw new NotFoundError('Trabajador', staffId);
  const [zones, invitation] = await Promise.all([
    staffRepo.listZones(staffId),
    invitationService.statusForUser(staffId),
  ]);
  return { ...profile, zones, invitation };
}

module.exports = {
  createStaff,
  updateStaff,
  setVerification,
  setActive,
  reinvite,
  list,
  getAdminProfile,
};
