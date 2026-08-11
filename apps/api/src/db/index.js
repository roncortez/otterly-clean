'use strict';

const pgPromise = require('pg-promise');
const env = require('../config/env');

const pgp = pgPromise({
  // Convierte snake_case de SQL en el mismo shape que espera la capa de
  // servicios. Se mantiene snake_case en JS para no traducir dos veces.
  capSQL: true,
});

// BIGINT (int8) llega como string por precision. Nuestros ids caben en Number,
// asi que se convierten para no propagar strings por toda la API.
pgp.pg.types.setTypeParser(pgp.pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));
// NUMERIC como number (los importes de dinero son INTEGER, no NUMERIC).
pgp.pg.types.setTypeParser(pgp.pg.types.builtins.NUMERIC, (value) => Number.parseFloat(value));

const db = pgp({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
  max: 10,
  // Falla rapido si la base no responde, en vez de colgar la peticion HTTP.
  connectionTimeoutMillis: 5000,
});

module.exports = { db, pgp };
