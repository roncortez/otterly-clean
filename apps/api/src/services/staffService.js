'use strict';

const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { db } = require('../db');
const userRepository = require('../db/repositories/userRepository');
const staffRepo = require('../db/repositories/staffRepository');
const audit = require('./auditService');
const { assertNotLastActiveAdmin } = require('./userService');
const { ROLES } = require('../domain/shared/roles');
const { ConflictError, NotFoundError } = require('../domain/errors');

/**
 * Gestion de trabajadores.
 *
 * Las cuentas STAFF NO se crean por registro publico: las crea Operaciones.
 * Ese es justamente el punto que diferencia esta plataforma de un marketplace
 * abierto, y por eso vive aqui y no en authService.
 */

async function createStaff({ payload, actor, request }) {
  const existing = await userRepository.findByEmail(payload.email);
  if (existing) throw new ConflictError('Ya existe una cuenta con ese correo', { field: 'email' });

  return db.tx(async (tx) => {
    const passwordHash = await bcrypt.hash(payload.password, env.auth.bcryptRounds);

    const user = await userRepository.create(
      {
        email: payload.email,
        passwordHash,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        roles: [ROLES.STAFF],
        regionCode: payload.regionCode ?? env.defaultRegion,
        locale: payload.locale ?? 'es',
      },
      tx,
    );

    await staffRepo.createProfile(
      {
        userId: user.id,
        employeeCode: payload.employeeCode,
        displayName: payload.displayName ?? payload.firstName,
        photoUrl: payload.photoUrl,
        bio: payload.bio,
        hiredAt: payload.hiredAt,
        skills: payload.skills ?? [],
        serviceTypes: payload.serviceTypes ?? [],
      },
      tx,
    );

    if (payload.zoneIds?.length) {
      await staffRepo.setZones(user.id, payload.zoneIds, tx);
    }

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.STAFF_CREATED,
        entityType: 'user',
        entityId: user.id,
        after: { email: user.email, serviceTypes: payload.serviceTypes },
        request,
      },
      tx,
    );

    return staffRepo.findAdminProfile(user.id, tx);
  });
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
    const map = {
      displayName: 'display_name',
      photoUrl: 'photo_url',
      bio: 'bio',
      employeeCode: 'employee_code',
      hiredAt: 'hired_at',
      skills: 'skills',
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

async function list(filters) {
  return staffRepo.list(filters);
}

async function getAdminProfile(staffId) {
  const profile = await staffRepo.findAdminProfile(staffId);
  if (!profile) throw new NotFoundError('Trabajador', staffId);
  const zones = await staffRepo.listZones(staffId);
  return { ...profile, zones };
}

module.exports = { createStaff, updateStaff, setVerification, setActive, list, getAdminProfile };
