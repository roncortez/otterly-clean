'use strict';

const crypto = require('node:crypto');
const { v2: cloudinary } = require('cloudinary');
const env = require('../config/env');
const audit = require('./auditService');
const { SERVICE_DEFINITIONS } = require('../domain/shared/serviceTypes');
const { DomainError, ValidationError } = require('../domain/errors');

/**
 * Imagenes de la plataforma.
 *
 * Dos usos, con reglas distintas:
 *
 *   1. Imagenes de marca (logo, icono, servicios, banner). Publicas por
 *      definicion, destino de un catalogo cerrado y solo ADMIN.
 *   2. Fotos de perfil. Las sube su dueno, y el destino se deriva de la sesion,
 *      nunca de la peticion.
 *
 * Los documentos de verificacion y las fotos de incidencias siguen sin
 * almacenamiento: son datos sensibles y Cloudinary sirve por URL, asi que no
 * deben pasar por aqui sin volver a pensar el control de acceso.
 */

// ---------------------------------------------------------------------------
// Destinos
// ---------------------------------------------------------------------------

/**
 * Catalogo CERRADO de destinos.
 *
 * Ni la carpeta ni el nombre del archivo vienen nunca de la peticion: el
 * cliente solo elige una etiqueta de esta lista. Si la ruta fuese un dato de
 * entrada, cualquiera con sesion de ADMIN podria escribir en cualquier carpeta
 * de la cuenta —incluida la de otro proyecto que comparta el mismo Cloudinary—
 * o sobrescribir un archivo ajeno con un `../`.
 *
 * Cada destino tiene un `publicId` FIJO. Eso da dos cosas a la vez:
 *   * organizacion: cada imagen vive en su carpeta, no sueltas en la raiz;
 *   * sin huerfanos: volver a subir el logo reemplaza el anterior en lugar de
 *     dejar copias acumulandose en la cuenta.
 */
const SLOTS = Object.freeze({
  COMPANY_LOGO: {
    folder: 'marca',
    publicId: 'logo',
    label: 'Logo de la empresa',
    // Un logo no necesita ser enorme; se limita en origen para no servir
    // megabytes en una cabecera de 32 px.
    maxWidth: 512,
    maxHeight: 512,
  },
  COMPANY_ICON: {
    folder: 'marca',
    publicId: 'icono',
    label: 'Icono de la empresa',
    maxWidth: 256,
    maxHeight: 256,
  },
  BANNER: {
    folder: 'avisos',
    publicId: 'banner-inicio',
    label: 'Banner de la portada',
    maxWidth: 1600,
    maxHeight: 900,
  },
  // Un destino por tipo de servicio, derivado del dominio para que anadir un
  // servicio no obligue a acordarse de esta lista.
  ...Object.fromEntries(
    Object.values(SERVICE_DEFINITIONS).map((service) => [
      `SERVICE_${service.code}`,
      {
        folder: 'servicios',
        publicId: service.code.toLowerCase(),
        label: `Imagen de ${service.label}`,
        maxWidth: 1200,
        maxHeight: 800,
      },
    ]),
  ),
});

const SLOT_CODES = Object.freeze(Object.keys(SLOTS));

// ---------------------------------------------------------------------------
// Validacion del archivo
// ---------------------------------------------------------------------------

/**
 * Formatos admitidos y su firma binaria.
 *
 * Se comprueban los primeros bytes y no el `Content-Type` que declara el
 * navegador, porque ese dato lo escribe quien hace la peticion y se puede
 * mentir. Comprobar la firma evita guardar como imagen algo que no lo es.
 *
 * SVG queda fuera a proposito: es XML, admite scripts y no tiene firma binaria
 * que comprobar. Un logo en SVG hay que convertirlo antes a PNG.
 */
const SIGNATURES = [
  { format: 'png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { format: 'jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  // WebP: "RIFF" .... "WEBP"
  { format: 'webp', mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], at8: [0x57, 0x45, 0x42, 0x50] },
];

const ACCEPTED_MIME_TYPES = Object.freeze(SIGNATURES.map((s) => s.mime));

function detectFormat(buffer) {
  if (!buffer || buffer.length < 12) return null;

  return (
    SIGNATURES.find((signature) => {
      const headMatches = signature.bytes.every((byte, index) => buffer[index] === byte);
      if (!headMatches) return false;
      if (!signature.at8) return true;
      return signature.at8.every((byte, index) => buffer[8 + index] === byte);
    }) ?? null
  );
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

let configured = false;

/** ¿Hay credenciales? Si no, la interfaz vuelve al campo de URL. */
function isEnabled() {
  return Boolean(env.uploads.cloudName && env.uploads.apiKey && env.uploads.apiSecret);
}

function client() {
  if (!isEnabled()) {
    throw new DomainError(
      'UPLOADS_NOT_CONFIGURED',
      'La subida de imagenes no esta configurada en este entorno',
    );
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: env.uploads.cloudName,
      api_key: env.uploads.apiKey,
      api_secret: env.uploads.apiSecret,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

/** Lo que la interfaz necesita saber antes de pintar el campo de imagen. */
function describe() {
  return {
    enabled: isEnabled(),
    maxBytes: env.uploads.maxBytes,
    acceptedMimeTypes: ACCEPTED_MIME_TYPES,
    slots: SLOT_CODES.map((code) => ({ code, label: SLOTS[code].label })),
  };
}

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------

function uploadBuffer(sdk, buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = sdk.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });
}

/**
 * Comprobaciones que no dependen del destino: que venga algo, que quepa y que
 * sea de verdad una imagen. La firma binaria manda sobre el `Content-Type`.
 */
function assertValidImage(file) {
  if (!file?.buffer?.length) {
    throw new ValidationError('No se recibio ninguna imagen', [
      { path: 'file', message: 'Adjunta una imagen' },
    ]);
  }

  if (file.buffer.length > env.uploads.maxBytes) {
    throw new ValidationError('La imagen es demasiado grande', [
      {
        path: 'file',
        message: `El maximo es ${Math.round(env.uploads.maxBytes / 1024 / 1024)} MB`,
      },
    ]);
  }

  const detected = detectFormat(file.buffer);
  if (!detected) {
    throw new ValidationError('El archivo no es una imagen admitida', [
      { path: 'file', message: 'Formatos admitidos: PNG, JPG y WebP' },
    ]);
  }

  return detected;
}

/**
 * Sube una imagen al destino indicado y devuelve su URL definitiva.
 *
 * La URL incluye la version que asigna Cloudinary, asi que al reemplazar una
 * imagen cambia la URL y ninguna cache sirve la anterior.
 */
async function uploadImage({ slot, file, actor, request }) {
  const destination = SLOTS[slot];
  if (!destination) {
    throw new ValidationError('Destino de imagen desconocido', [
      { path: 'slot', message: `Valores admitidos: ${SLOT_CODES.join(', ')}` },
    ]);
  }

  assertValidImage(file);

  const sdk = client();
  const folder = `${env.uploads.baseFolder}/${destination.folder}`;

  const result = await uploadBuffer(sdk, file.buffer, {
    folder,
    public_id: destination.publicId,
    // Reemplaza en lugar de acumular: el logo siempre vive en la misma ruta.
    overwrite: true,
    invalidate: true,
    resource_type: 'image',
    // Se ignora cualquier nombre o extension que venga del navegador.
    use_filename: false,
    unique_filename: false,
    // Se acota el tamano en origen. `limit` nunca amplia: una imagen pequena
    // se guarda tal cual.
    transformation: [
      {
        width: destination.maxWidth,
        height: destination.maxHeight,
        crop: 'limit',
        quality: 'auto:good',
      },
    ],
  });

  await audit.record({
    actor,
    action: audit.ACTIONS.MEDIA_UPLOADED,
    entityType: 'media',
    entityId: result.public_id,
    after: {
      slot,
      url: result.secure_url,
      bytes: result.bytes,
      format: result.format,
      width: result.width,
      height: result.height,
    },
    request,
  });

  return {
    slot,
    url: result.secure_url,
    publicId: result.public_id,
    folder,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
  };
}

/**
 * Borra la imagen de un destino.
 *
 * No falla si no existe: quitar una imagen que ya no estaba es el resultado que
 * se pedia.
 */
async function removeImage({ slot, actor, request }) {
  const destination = SLOTS[slot];
  if (!destination) {
    throw new ValidationError('Destino de imagen desconocido', [
      { path: 'slot', message: `Valores admitidos: ${SLOT_CODES.join(', ')}` },
    ]);
  }

  const sdk = client();
  const publicId = `${env.uploads.baseFolder}/${destination.folder}/${destination.publicId}`;

  const result = await sdk.uploader.destroy(publicId, { invalidate: true });

  await audit.record({
    actor,
    action: audit.ACTIONS.MEDIA_DELETED,
    entityType: 'media',
    entityId: publicId,
    before: { slot },
    request,
  });

  return { slot, publicId, result: result.result };
}

// ---------------------------------------------------------------------------
// Fotos de perfil
// ---------------------------------------------------------------------------

/**
 * Carpeta de las fotos de perfil.
 *
 * Se trata aparte del catalogo de destinos porque su identificador depende de
 * la persona, no de una etiqueta fija. Dos decisiones deliberadas:
 *
 *   * El identificador se construye con el `userId` **de la sesion**, nunca con
 *     un dato de la peticion: sigue sin haber forma de escribir en la carpeta
 *     de otra persona ni fuera de la del proyecto.
 *   * Lleva un sufijo aleatorio. Cloudinary sirve por URL publica, y un nombre
 *     predecible —`usuario-42`— dejaria enumerar las fotos de toda la base. La
 *     referencia del archivo se guarda en la ficha; la URL no se adivina.
 */
const PROFILE_PHOTO = Object.freeze({
  folder: 'perfiles',
  maxWidth: 640,
  maxHeight: 640,
});

function profilePhotoPublicId(userId) {
  return `usuario-${userId}-${crypto.randomBytes(6).toString('hex')}`;
}

async function uploadProfilePhoto({ userId, file, actor, request }) {
  assertValidImage(file);

  const sdk = client();
  const folder = `${env.uploads.baseFolder}/${PROFILE_PHOTO.folder}`;

  const result = await uploadBuffer(sdk, file.buffer, {
    folder,
    public_id: profilePhotoPublicId(userId),
    overwrite: false,
    resource_type: 'image',
    use_filename: false,
    unique_filename: false,
    transformation: [
      {
        width: PROFILE_PHOTO.maxWidth,
        height: PROFILE_PHOTO.maxHeight,
        // Recorta centrado en la cara: una foto de perfil se muestra siempre
        // en un circulo pequeno y encuadrarla en origen evita cabezas cortadas.
        crop: 'fill',
        gravity: 'face',
        quality: 'auto:good',
      },
    ],
  });

  await audit.record({
    actor,
    action: audit.ACTIONS.MEDIA_UPLOADED,
    entityType: 'media',
    entityId: result.public_id,
    after: { slot: 'PROFILE_PHOTO', userId, bytes: result.bytes, format: result.format },
    request,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
  };
}

/**
 * Borra un archivo por su identificador ya guardado.
 *
 * Solo se llama con identificadores que salieron de la base, nunca con uno
 * recibido en una peticion. No lanza: quitar una foto que ya no estaba es el
 * resultado que se pedia, y un fallo del almacenamiento no debe tumbar el
 * cambio de perfil que ya se guardo.
 */
async function removeByPublicId(publicId) {
  if (!publicId || !isEnabled()) return { result: 'skipped' };
  try {
    return await client().uploader.destroy(publicId, { invalidate: true });
  } catch (error) {
    console.error(`[uploads] no se pudo borrar ${publicId}:`, error.message);
    return { result: 'error' };
  }
}

module.exports = {
  SLOTS,
  SLOT_CODES,
  ACCEPTED_MIME_TYPES,
  PROFILE_PHOTO,
  isEnabled,
  describe,
  detectFormat,
  assertValidImage,
  uploadImage,
  removeImage,
  uploadProfilePhoto,
  removeByPublicId,
};
