'use strict';

const authService = require('../../services/authService');
const userRepository = require('../../db/repositories/userRepository');
const { UnauthorizedError, ForbiddenError } = require('../../domain/errors');
const { hasAnyRole, primaryRole } = require('../../domain/shared/roles');

/**
 * Autenticación y autorización.
 *
 * Nunca se confia en el frontend para impedir acciones. Toda ruta protegida
 * pasa por `authenticate`, y los roles se releen de la base de datos en cada
 * peticion: un token emitido antes de retirarle ADMIN a alguien no debe seguir
 * sirviendo.
 *
 * ### Rol efectivo
 *
 * Con roles multiples, "que puede hacer" ya no basta: hace falta saber "como
 * esta actuando ahora". Alguien con ADMIN + STAFF que abre /api/staff debe ver
 * la proyeccion del trabajador, no la del administrador; el mismo usuario en
 * /api/operations debe verlo todo.
 *
 * Como cada arbol de rutas declara su audiencia, `requireRole` fija el rol
 * efectivo (`req.user.role`) al rol que esa ruta exige. Asi el resto del
 * sistema —proyecciones, maquina de estados, auditoria— sigue razonando con un
 * unico rol y aplica el minimo privilegio del contexto, no el maximo del
 * usuario.
 */

function extractToken(req) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Adjunta el usuario con sus roles y un rol efectivo por defecto. */
function attachUser(req, user, role = primaryRole(user.roles)) {
  req.user = { ...user, role };
}

async function authenticate(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw new UnauthorizedError('Falta el token de acceso');

    const payload = authService.verifyAccessToken(token);
    const user = await userRepository.findById(Number(payload.sub));

    if (!user) throw new UnauthorizedError('La cuenta ya no existe');
    if (user.status !== 'ACTIVE') throw new ForbiddenError('Esta cuenta está desactivada');
    if (user.roles.length === 0) throw new ForbiddenError('Esta cuenta no tiene ningún rol asignado');

    // Los roles vienen de la base, no del token: si cambiaron, manda la base.
    attachUser(req, user);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Restringe una ruta a uno o varios roles y fija el rol efectivo.
 *
 * Cuando el usuario cumple con varios de los roles pedidos se toma el primero
 * declarado, que es el que la ruta considera principal.
 */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!hasAnyRole(req.user.roles, roles)) {
      return next(new ForbiddenError('No tienes permiso para acceder a este recurso'));
    }
    req.user.role = roles.find((role) => req.user.roles.includes(role));
    next();
  };
}

/** Autenticacion opcional: rellena req.user si hay token valido, sin exigirlo. */
async function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = authService.verifyAccessToken(token);
    const user = await userRepository.findById(Number(payload.sub));
    if (user) attachUser(req, user);
  } catch {
    // Token invalido en ruta publica: se ignora.
  }
  next();
}

module.exports = { authenticate, requireRole, optionalAuth };
