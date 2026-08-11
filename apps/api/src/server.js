'use strict';

const { createApp } = require('./http/app');
const env = require('./config/env');
const { db } = require('./db');

async function start() {
  // Falla al arrancar si la base no responde, en lugar de aceptar peticiones
  // que se romperan una por una.
  try {
    await db.one('SELECT 1 AS ok');
  } catch (error) {
    console.error('No se pudo conectar a PostgreSQL:', error.message);
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(env.port, () => {
    console.log(`API de Otterly Clean escuchando en http://localhost:${env.port}`);
    console.log(`Entorno: ${env.nodeEnv} | Region por defecto: ${env.defaultRegion}`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} recibido, cerrando...`);
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
