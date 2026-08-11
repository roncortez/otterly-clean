'use strict';

const authService = require('../../services/authService');
const userRepository = require('../../db/repositories/userRepository');
const { UnauthorizedError, ForbiddenError } = require('../../domain/errors');

/**
 * Autenticacion y autorizacion.
 *
 * Nunca se confia en el frontend para impedir acciones. Toda ruta protegida
 * pasa por `authenticate`, y el rol se revalida contra la base de datos en
 * cada peticion: un token emitido antes de desactivar a un trabajador no debe
 * seguir sirviendo.
 */

function extractToken(req) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

async function authenticate(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw new UnauthorizedError('Falta el token de acceso');

    const payload = authService.verifyAccessToken(token);
    const user = await userRepository.findById(Number(payload.sub));

    if (!user) throw new UnauthorizedError('La cuenta ya no existe');
    if (user.status !== 'ACTIVE') throw new ForbiddenError('Esta cuenta esta desactivada');

    // El rol viene de la base, no del token: si cambio, manda la base.
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/** Restringe una ruta a uno o varios roles. */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('No tienes permiso para acceder a este recurso'));
    }
    next();
  };
}

/** Autenticacion opcional: rellena req.user si hay token valido, sin exigirlo. */
async function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = authService.verifyAccessToken(token);
    req.user = await userRepository.findById(Number(payload.sub));
  } catch {
    // Token invalido en ruta publica: se ignora.
  }
  next();
}

module.exports = { authenticate, requireRole, optionalAuth };
