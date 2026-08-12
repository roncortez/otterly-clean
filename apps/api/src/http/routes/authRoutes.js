'use strict';

const express = require('express');
const authService = require('../../services/authService');
const invitationService = require('../../services/invitationService');
const onboardingService = require('../../services/onboardingService');
const profileService = require('../../services/profileService');
const userRepository = require('../../db/repositories/userRepository');
const { authenticate } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/validate');
const schemas = require('../schemas');

const router = express.Router();

/**
 * Usuario de la sesion + si le falta completar su perfil.
 *
 * El estado del onboarding viaja con el usuario para que la aplicacion sepa a
 * donde llevarle nada mas entrar, sin una peticion extra ni un parpadeo. La
 * decision real la sigue tomando el servidor: esto es solo lo que el cliente
 * necesita para no pintar una pantalla que va a tener que abandonar.
 */
async function withOnboarding(projectedUser) {
  return { ...projectedUser, onboarding: await onboardingService.summary(projectedUser) };
}

/**
 * POST /api/auth/register
 * Registro publico. Siempre crea un CUSTOMER: el rol no se acepta del cliente.
 */
router.post(
  '/register',
  validate({ body: schemas.registerSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.register(req.body, {
      userAgent: req.get('user-agent'),
      request: req,
    });
    res.status(201).json({ ...session, user: await withOnboarding(session.user) });
  }),
);

router.post(
  '/login',
  validate({ body: schemas.loginSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.login(req.body, {
      userAgent: req.get('user-agent'),
      request: req,
    });
    res.json({ ...session, user: await withOnboarding(session.user) });
  }),
);

router.post(
  '/refresh',
  validate({ body: schemas.refreshSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.refresh(req.body.refreshToken, {
      userAgent: req.get('user-agent'),
    });
    res.json({ ...session, user: await withOnboarding(session.user) });
  }),
);

// ---------------------------------------------------------------------------
// Invitaciones
//
// Publicas a proposito: quien las usa todavia no tiene sesion. La proteccion es
// el token —aleatorio, de un solo uso y caducable—, no la autenticacion.
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/invitations/:token
 * Comprueba el enlace antes de pedir la contrasena. Responde lo minimo: el
 * nombre de pila, para saludar. Un token inexistente, caducado o ya usado
 * responden 404 por igual, para no convertir esto en un detector de correos
 * registrados.
 */
router.get(
  '/invitations/:token',
  validate({ params: schemas.invitationTokenParamSchema }),
  asyncHandler(async (req, res) => {
    const invitation = await invitationService.validateToken(req.validatedParams.token);
    res.json({
      invitation: {
        firstName: invitation.first_name,
        expiresAt: invitation.expires_at,
      },
    });
  }),
);

/**
 * POST /api/auth/invitations/:token/accept
 * La persona elige su contrasena, el token se consume y entra con sesion
 * abierta directamente a su onboarding.
 */
router.post(
  '/invitations/:token/accept',
  validate({
    params: schemas.invitationTokenParamSchema,
    body: schemas.acceptInvitationSchema,
  }),
  asyncHandler(async (req, res) => {
    const session = await invitationService.accept({
      token: req.validatedParams.token,
      password: req.body.password,
      userAgent: req.get('user-agent'),
      request: req,
    });
    res.json({ ...session, user: await withOnboarding(session.user) });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logout(req.body?.refreshToken);
    res.status(204).send();
  }),
);

/** Usuario de la sesion, con el estado de su onboarding. */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: await withOnboarding(authService.projectUser(req.user)) });
  }),
);

/**
 * PATCH /api/auth/me
 *
 * Se conserva por compatibilidad con lo que ya llamaba aqui, pero no tiene
 * logica propia: delega en el mismo servicio que /api/me/profile, con su
 * esquema estricto y su separacion entre lo que decide la persona y lo que
 * decide la empresa. Antes escribia columnas sin validar nada.
 */
router.patch(
  '/me',
  authenticate,
  validate({ body: schemas.selfProfileSchema }),
  asyncHandler(async (req, res) => {
    await profileService.updateProfile({ user: req.user, payload: req.body, request: req });
    const user = await userRepository.findById(req.user.id);
    res.json({ user: await withOnboarding(authService.projectUser(user)) });
  }),
);

router.post(
  '/change-password',
  authenticate,
  validate({ body: schemas.changePasswordSchema }),
  asyncHandler(async (req, res) => {
    await authService.changePassword(req.user.id, req.body);
    res.status(204).send();
  }),
);

module.exports = router;
