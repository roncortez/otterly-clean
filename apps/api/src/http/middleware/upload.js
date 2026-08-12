'use strict';

const multer = require('multer');
const env = require('../../config/env');
const uploadService = require('../../services/uploadService');
const { ValidationError } = require('../../domain/errors');

/**
 * Recepcion de imagenes.
 *
 * En memoria y no en disco: el archivo se reenvia a Cloudinary y no hace falta
 * que toque el sistema de ficheros del servidor. Asi no queda nada que limpiar
 * ni una carpeta de subidas que alguien pueda acabar sirviendo por error.
 *
 * Los limites viven aqui, delante de todo: rechazar un archivo demasiado grande
 * antes de leerlo entero es mas barato que descubrirlo despues.
 */
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.uploads.maxBytes,
    files: 1,
    // Un solo campo de texto (el destino); nada mas tiene por que venir.
    fields: 2,
  },
  fileFilter(_req, file, callback) {
    // Primer filtro por lo que declara el navegador. La comprobacion de verdad
    // —la firma binaria del archivo— la hace uploadService: este dato lo
    // escribe el cliente y se puede falsear.
    if (!uploadService.ACCEPTED_MIME_TYPES.includes(file.mimetype)) {
      return callback(
        new ValidationError('Formato de imagen no admitido', [
          { path: 'file', message: 'Formatos admitidos: PNG, JPG y WebP' },
        ]),
      );
    }
    callback(null, true);
  },
});

/** Acepta un unico archivo en el campo `image`, traduciendo los errores. */
function singleImage(field = 'image') {
  const handler = memoryUpload.single(field);

  return (req, res, next) => {
    handler(req, res, (error) => {
      if (!error) return next();

      if (error instanceof multer.MulterError) {
        const message =
          error.code === 'LIMIT_FILE_SIZE'
            ? `La imagen supera el maximo de ${Math.round(env.uploads.maxBytes / 1024 / 1024)} MB`
            : 'No se pudo procesar el archivo enviado';
        return next(new ValidationError(message, [{ path: field, message }]));
      }

      next(error);
    });
  };
}

module.exports = { singleImage };
