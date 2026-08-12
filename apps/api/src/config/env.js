'use strict';

require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 10000),
  defaultRegion: process.env.DEFAULT_REGION || 'EC',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'otterly_clean',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
  },
  // Direccion publica de la aplicacion web. Se usa para construir el enlace de
  // activacion que recibe un trabajador invitado; el backend no sirve esa
  // pantalla, solo la enlaza.
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '30d',
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
    // Vida del enlace de invitacion. Corta a proposito: es una credencial de
    // un solo uso que abre una cuenta sin contrasena.
    invitationTtlHours: Number(process.env.INVITATION_TTL_HOURS || 72),
  },
  crypto: {
    encryptionKey: process.env.ENCRYPTION_KEY || '',
  },
  // Almacenamiento de imagenes publicas (logo, iconos de servicio, banner).
  // Si falta cualquiera de las tres credenciales la subida queda desactivada y
  // la interfaz vuelve al campo de URL: la aplicacion sigue funcionando.
  uploads: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    // Prefijo bajo el que se agrupa TODO lo que sube esta aplicacion, para no
    // mezclarlo con lo que ya hubiera en la cuenta.
    baseFolder: process.env.CLOUDINARY_FOLDER || 'otterly-clean',
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024),
  },
  notifications: {
    driver: process.env.NOTIFICATIONS_DRIVER || 'console',
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
};

module.exports = env;
