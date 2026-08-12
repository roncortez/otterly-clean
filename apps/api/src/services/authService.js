'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { db } = require('../db');
const userRepository = require('../db/repositories/userRepository');
const { hashToken, randomToken } = require('./crypto');
const audit = require('./auditService');
const { ROLES, primaryRole } = require('../domain/shared/roles');
const { UnauthorizedError, ConflictError, ForbiddenError } = require('../domain/errors');

/**
 * Autenticación y sesiones.
 *
 * Access token JWT de vida corta + refresh token opaco de vida larga guardado
 * hasheado en base de datos, para poder revocar sesiones. El access token
 * lleva el rol, pero la autorización real siempre se revalida contra la base
 * en cada petición sensible: un token viejo no debe dar acceso a un usuario ya
 * desactivado.
 */

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), roles: user.roles ?? [], region: user.region_code },
    env.auth.jwtSecret,
    { expiresIn: env.auth.accessTokenTtl },
  );
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.auth.jwtSecret);
  } catch {
    throw new UnauthorizedError('Token inválido o expirado');
  }
}

/** Convierte "30d" / "15m" en milisegundos. */
function ttlToMs(ttl) {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 30 * 24 * 3600 * 1000;
  const value = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return value * unit;
}

async function issueRefreshToken(userId, userAgent, tx = db) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlToMs(env.auth.refreshTokenTtl));

  await tx.none(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent) VALUES ($1, $2, $3, $4)',
    [userId, hashToken(token), expiresAt, userAgent ?? null],
  );
  return token;
}

/**
 * Proyeccion del usuario que viaja al cliente. `roles` es la lista completa;
 * el frontend la usa para decidir que menus mostrar, pero el backend vuelve a
 * comprobarla en cada peticion.
 */
function projectUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    roles: user.roles ?? [],
    regionCode: user.region_code,
    locale: user.locale,
  };
}

async function buildSession(user, { userAgent } = {}, tx = db) {
  const refreshToken = await issueRefreshToken(user.id, userAgent, tx);
  return {
    accessToken: signAccessToken(user),
    refreshToken,
    user: projectUser(user),
  };
}

/**
 * Registro público. Solo crea CUSTOMER: el rol nunca viene del cliente.
 * Las cuentas de STAFF y ADMIN las crea Operaciones (staffService).
 */
async function register({ email, password, firstName, lastName, phone, regionCode, locale }, context = {}) {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new ConflictError('Ya existe una cuenta con ese correo', { field: 'email' });
  }

  return db.tx(async (tx) => {
    const passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds);
    const user = await userRepository.create(
      {
        email,
        passwordHash,
        firstName,
        lastName,
        phone,
        // El rol NUNCA se acepta del cliente: el registro publico solo crea
        // clientes. STAFF y ADMIN se otorgan desde Operaciones.
        roles: [ROLES.CUSTOMER],
        regionCode: regionCode ?? env.defaultRegion,
        locale: locale ?? 'es',
      },
      tx,
    );

    await tx.none('INSERT INTO customer_profiles (user_id) VALUES ($1)', [user.id]);
    return buildSession(user, context, tx);
  });
}

async function login({ email, password }, context = {}) {
  const user = await userRepository.findByEmailWithSecret(email);

  // Mismo mensaje y mismo coste aproximado tanto si el usuario no existe como
  // si la clave es incorrecta, para no filtrar qué correos están registrados.
  if (!user) {
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu');
    throw new UnauthorizedError('Correo o contraseña incorrectos');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await audit.record({
      actor: { id: user.id, role: primaryRole(user.roles) },
      action: audit.ACTIONS.USER_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      request: context.request,
    });
    throw new UnauthorizedError('Correo o contraseña incorrectos');
  }

  if (user.status !== 'ACTIVE') {
    throw new ForbiddenError('Esta cuenta está desactivada. Contacta con la empresa.');
  }

  return db.tx(async (tx) => {
    await userRepository.touchLogin(user.id, tx);
    await audit.record(
      {
        actor: { id: user.id, role: primaryRole(user.roles) },
        action: audit.ACTIONS.USER_LOGIN,
        entityType: 'user',
        entityId: user.id,
        request: context.request,
      },
      tx,
    );
    return buildSession(user, context, tx);
  });
}

/** Rota el refresh token: el anterior se revoca al usarse. */
async function refresh(refreshTokenValue, context = {}) {
  const stored = await db.oneOrNone(
    `SELECT * FROM refresh_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [hashToken(refreshTokenValue)],
  );

  if (!stored) throw new UnauthorizedError('Sesión expirada, inicia sesión de nuevo');

  const user = await userRepository.findById(stored.user_id);
  if (!user || user.status !== 'ACTIVE') {
    throw new UnauthorizedError('Sesión inválida');
  }

  return db.tx(async (tx) => {
    await tx.none('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [stored.id]);
    return buildSession(user, context, tx);
  });
}

async function logout(refreshTokenValue) {
  if (!refreshTokenValue) return;
  await db.none(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(refreshTokenValue)],
  );
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await db.oneOrNone('SELECT id, email, password_hash FROM users WHERE id = $1', [userId]);
  if (!user) throw new UnauthorizedError();

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw new UnauthorizedError('La contraseña actual no es correcta');

  const passwordHash = await bcrypt.hash(newPassword, env.auth.bcryptRounds);

  await db.tx(async (tx) => {
    await userRepository.updatePassword(userId, passwordHash, tx);
    // Cambiar la clave cierra todas las sesiones abiertas.
    await tx.none('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [
      userId,
    ]);
  });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  changePassword,
  verifyAccessToken,
  signAccessToken,
  projectUser,
  // Lo usa invitationService: aceptar una invitacion deja la sesion abierta,
  // igual que registrarse, y no debe reimplementar como se emite.
  buildSession,
};
