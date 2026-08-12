'use strict';

const express = require('express');
const profileService = require('../../services/profileService');
const onboardingService = require('../../services/onboardingService');
const uploadService = require('../../services/uploadService');
const { authenticate } = require('../middleware/auth');
const { singleImage } = require('../middleware/upload');
const { validate, asyncHandler } = require('../middleware/validate');
const schemas = require('../schemas');

const router = express.Router();

/**
 * Lo que le pertenece a quien ha iniciado sesion.
 *
 * El resto de arboles se agrupa por audiencia (/api/customer exige CUSTOMER,
 * /api/operations exige ADMIN). Este no exige ningun rol concreto porque su
 * sujeto no es un rol: es la persona. Un ADMIN que ademas trabaja edita su
 * telefono y su foto por aqui, no por dos sitios distintos segun por donde haya
 * entrado.
 *
 * El control de acceso es el mas simple que existe y el que no se puede
 * equivocar: **el recurso es siempre `req.user.id`**. No hay ningun `:id` en
 * estas rutas, asi que no hay forma de pedir el perfil de otra persona.
 */
router.use(authenticate);

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json({ profile: await profileService.getProfile(req.user) });
  }),
);

/**
 * PATCH /api/me/profile
 *
 * Solo datos personales. Roles, estado de la cuenta, capacidades de servicio,
 * zonas y verificacion no estan en el esquema ni en el mapa del servicio: si
 * llegan, la peticion falla en lugar de guardarlas a medias.
 */
router.patch(
  '/profile',
  validate({ body: schemas.selfProfileSchema }),
  asyncHandler(async (req, res) => {
    const profile = await profileService.updateProfile({
      user: req.user,
      payload: req.body,
      request: req,
    });
    res.json({ profile });
  }),
);

// ---------------------------------------------------------------------------
// Foto de perfil
// ---------------------------------------------------------------------------

/** Lo que la pantalla necesita antes de ofrecer la subida. */
router.get(
  '/photo/config',
  asyncHandler(async (_req, res) => {
    const { enabled, maxBytes, acceptedMimeTypes } = uploadService.describe();
    res.json({ uploads: { enabled, maxBytes, acceptedMimeTypes } });
  }),
);

/**
 * POST /api/me/photo
 * El archivo se valida por su firma binaria, se limita en tamano y se guarda en
 * el almacenamiento; la base solo conserva la URL y la referencia del archivo.
 */
router.post(
  '/photo',
  singleImage('image'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await profileService.setPhoto({ user: req.user, file: req.file, request: req }));
  }),
);

router.delete(
  '/photo',
  asyncHandler(async (req, res) => {
    res.json(await profileService.removePhoto({ user: req.user, request: req }));
  }),
);

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

/**
 * GET /api/me/onboarding
 * Los pasos que le faltan a ESTA persona, ya calculados: quien se registro con
 * telefono no vuelve a verlo, y quien solo administra no recibe ningun paso.
 */
router.get(
  '/onboarding',
  asyncHandler(async (req, res) => {
    res.json({ onboarding: await onboardingService.getState(req.user) });
  }),
);

router.patch(
  '/onboarding',
  validate({ body: schemas.onboardingPatchSchema }),
  asyncHandler(async (req, res) => {
    const onboarding = await onboardingService.saveProgress({
      user: req.user,
      payload: req.body,
      request: req,
    });
    res.json({ onboarding });
  }),
);

/**
 * POST /api/me/onboarding/complete
 * Marca el perfil como completo. El servidor vuelve a comprobar que no falte
 * nada obligatorio: la validacion de la pantalla es comodidad, no barrera.
 */
router.post(
  '/onboarding/complete',
  asyncHandler(async (req, res) => {
    res.json({ onboarding: await onboardingService.complete({ user: req.user, request: req }) });
  }),
);

module.exports = router;
