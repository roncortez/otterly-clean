'use strict';

const express = require('express');
const authService = require('../../services/authService');
const userRepository = require('../../db/repositories/userRepository');
const { authenticate } = require('../middleware/auth');
const { validate, asyncHandler } = require('../middleware/validate');
const schemas = require('../schemas');

const router = express.Router();

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
    res.status(201).json(session);
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
    res.json(session);
  }),
);

router.post(
  '/refresh',
  validate({ body: schemas.refreshSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.refresh(req.body.refreshToken, {
      userAgent: req.get('user-agent'),
    });
    res.json(session);
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logout(req.body?.refreshToken);
    res.status(204).send();
  }),
);

/** Perfil del usuario autenticado. */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: authService.projectUser(req.user) });
  }),
);

router.patch(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const fields = {};
    if (req.body.firstName !== undefined) fields.first_name = req.body.firstName;
    if (req.body.lastName !== undefined) fields.last_name = req.body.lastName;
    if (req.body.phone !== undefined) fields.phone = req.body.phone;
    if (req.body.locale !== undefined) fields.locale = req.body.locale;

    const user = await userRepository.update(req.user.id, fields);
    res.json({ user: authService.projectUser(user) });
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
