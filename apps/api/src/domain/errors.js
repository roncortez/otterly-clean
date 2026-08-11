'use strict';

/**
 * Error de negocio. Se traduce a una respuesta HTTP 4xx en la capa http,
 * nunca a un 500. Los codigos son estables y consumibles por el frontend.
 */
class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

/** El recurso no existe o el actor no puede verlo (se responde igual: 404). */
class NotFoundError extends DomainError {
  constructor(resource, id) {
    super('NOT_FOUND', `${resource} no encontrado`, { resource, id });
    this.name = 'NotFoundError';
  }
}

/** El actor esta autenticado pero no tiene permiso sobre este recurso. */
class ForbiddenError extends DomainError {
  constructor(message = 'No tienes permiso para realizar esta accion', details = {}) {
    super('FORBIDDEN', message, details);
    this.name = 'ForbiddenError';
  }
}

class UnauthorizedError extends DomainError {
  constructor(message = 'Credenciales invalidas o sesion expirada') {
    super('UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

class ValidationError extends DomainError {
  constructor(message, issues = []) {
    super('VALIDATION_ERROR', message, { issues });
    this.name = 'ValidationError';
  }
}

class ConflictError extends DomainError {
  constructor(message, details = {}) {
    super('CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}

module.exports = {
  DomainError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
};
