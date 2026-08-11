'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('../config/env');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const customerRoutes = require('./routes/customerRoutes');
const staffRoutes = require('./routes/staffRoutes');
const operationsRoutes = require('./routes/operationsRoutes');

/**
 * Aplicacion Express.
 *
 * Las rutas se agrupan por audiencia, no por entidad. Eso hace que el control
 * de acceso sea evidente al leer: todo lo que cuelga de /api/operations exige
 * ADMIN, todo lo de /api/staff exige STAFF. No hay endpoints "mixtos" donde
 * sea facil equivocarse.
 */
function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        // Sin origin: peticiones de servidor a servidor o herramientas locales.
        if (!origin || env.cors.origins.includes(origin)) return callback(null, true);
        return callback(new Error('Origen no permitido por CORS'));
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ service: 'otterly-clean-api', status: 'ok', version: '1.0.0' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/customer', customerRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/operations', operationsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
