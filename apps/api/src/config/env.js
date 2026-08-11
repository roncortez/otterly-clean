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
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '30d',
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  },
  crypto: {
    encryptionKey: process.env.ENCRYPTION_KEY || '',
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
