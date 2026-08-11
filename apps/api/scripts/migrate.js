'use strict';

/**
 * Runner de migraciones.
 *
 * Aplica en orden los .sql de /migrations y registra cada uno en la tabla
 * schema_migrations para no reaplicarlo. Cada archivo corre dentro de una
 * transaccion: si falla a la mitad, no queda un esquema roto.
 *
 *   node scripts/migrate.js           aplica las pendientes
 *   node scripts/migrate.js --reset   borra y recrea el esquema completo
 */

const fs = require('node:fs');
const path = require('node:path');
const { db, pgp } = require('../src/db');
const env = require('../src/config/env');

const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

async function ensureMigrationsTable() {
  await db.none(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function reset() {
  if (env.isProduction) {
    throw new Error('--reset esta deshabilitado en produccion');
  }
  console.log('Borrando esquema public...');
  await db.none('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

async function run() {
  const shouldReset = process.argv.includes('--reset');

  if (shouldReset) await reset();
  await ensureMigrationsTable();

  const applied = new Set(
    (await db.any('SELECT name FROM schema_migrations')).map((row) => row.name),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  aplicando ${file} ... `);

    await db.tx(async (t) => {
      await t.none(sql);
      await t.none('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });

    console.log('ok');
    count += 1;
  }

  console.log(
    count === 0 ? 'Sin migraciones pendientes.' : `${count} migracion(es) aplicada(s).`,
  );
}

run()
  .then(() => pgp.end())
  .catch((error) => {
    console.error('\nError en la migracion:', error.message);
    pgp.end();
    process.exit(1);
  });
