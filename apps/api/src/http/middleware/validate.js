'use strict';

/**
 * Validacion de entrada con Zod.
 *
 * Toda ruta que reciba datos los valida aqui antes de llegar al controlador.
 * El resultado parseado reemplaza al original, de modo que los servicios
 * reciben datos ya normalizados y con los tipos correctos.
 */

function validate({ body, query, params }) {
  return (req, _res, next) => {
    try {
      if (params) req.validatedParams = params.parse(req.params);
      if (query) req.validatedQuery = query.parse(req.query);
      if (body) req.body = body.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Envuelve un handler async para que sus rechazos lleguen al errorHandler. */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { validate, asyncHandler };
