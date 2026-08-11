'use strict';

const { ZodError } = require('zod');
const env = require('../../config/env');
const { DomainError } = require('../../domain/errors');

/**
 * Traduce errores a respuestas HTTP consistentes.
 *
 * Los errores de negocio llevan un codigo estable que el frontend puede usar.
 * Cualquier otra cosa es un 500 con mensaje generico: los detalles internos no
 * salen al cliente.
 */

const STATUS_BY_CODE = {
  VALIDATION_ERROR: 400,
  INVALID_STATE: 400,
  INVALID_TRANSITION: 409,
  INVALID_SCHEDULE: 400,
  SCHEDULE_TOO_SOON: 400,
  INVALID_TIME_WINDOW: 400,
  PRICING_INPUT_REQUIRED: 400,
  UNKNOWN_PRICING_MODEL: 400,
  UNKNOWN_SERVICE_TYPE: 400,
  SERVICE_NOT_AVAILABLE: 400,
  NO_TRANSITION_PATH: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  FORBIDDEN_TRANSITION: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

function errorHandler(error, req, res, _next) {
  // Errores de validacion de esquema.
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son validos',
        issues: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }

  if (error instanceof DomainError) {
    const status = STATUS_BY_CODE[error.code] ?? 400;
    return res.status(status).json({
      error: { code: error.code, message: error.message, ...error.details },
    });
  }

  // Violacion de unicidad de PostgreSQL.
  if (error.code === '23505') {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'Ese registro ya existe' },
    });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}:`, error);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocurrio un error inesperado',
      ...(env.isProduction ? {} : { detail: error.message }),
    },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` },
  });
}

module.exports = { errorHandler, notFoundHandler };
