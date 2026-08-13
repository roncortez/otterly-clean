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
 *
 * `npm run dev` (en la raiz) llama a este script SIN --reset antes de levantar
 * nada. Es la razon de que los mensajes de error de aqui sean explicitos: si
 * fallan, lo siguiente que ve quien desarrolla no es la aplicacion arrancando,
 * es esto. Levantar el backend contra un esquema a medias produce errores de
 * columna inexistente en pantallas al azar, que cuestan mucho mas de
 * diagnosticar que una migracion que se niega a pasar.
 *
 * Migrar y sembrar son cosas distintas: este script no siembra nunca. `db:seed`
 * y `db:reset` siguen siendo manuales y explicitos porque destruyen datos.
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

  const pending = files.filter((file) => !applied.has(file));

  if (pending.length === 0) {
    console.log(`Base de datos al dia (${applied.size} migracion(es) aplicadas).`);
    return;
  }

  console.log(`${pending.length} migracion(es) pendiente(s):`);

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  aplicando ${file} ... `);

    try {
      await db.tx(async (t) => {
        await t.none(sql);
        await t.none('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      });
    } catch (error) {
      // El nombre del archivo es lo primero que hay que saber para arreglarlo,
      // y se pierde si solo se propaga el error de PostgreSQL.
      console.log('FALLO');
      error.migrationFile = file;
      throw error;
    }

    console.log('ok');
  }

  console.log(`${pending.length} migracion(es) aplicada(s).`);
}

/**
 * Mensaje util segun por que fallo.
 *
 * "connect ECONNREFUSED 127.0.0.1:5432" es correcto y no le dice nada a quien
 * acaba de clonar el repositorio.
 */
function explain(error) {
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)) {
    return [
      `No se pudo conectar a PostgreSQL en ${env.db.host}:${env.db.port}.`,
      '',
      'Comprueba que el servidor esta levantado y que apps/api/.env apunta a el',
      '(DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).',
    ].join('\n');
  }

  if (error.code === '3D000') {
    return [
      `La base de datos "${env.db.database}" no existe.`,
      '',
      `Creala una vez con:  createdb ${env.db.database}`,
      'y vuelve a ejecutar el comando.',
    ].join('\n');
  }

  if (error.migrationFile) {
    return [
      `La migracion ${error.migrationFile} no se pudo aplicar:`,
      `  ${error.message}`,
      '',
      'No se ha aplicado a medias: cada migracion corre en una transaccion.',
      'Las anteriores si quedaron aplicadas, asi que al corregir el problema',
      'basta con volver a ejecutar el comando.',
    ].join('\n');
  }

  return error.message;
}

run()
  .then(() => pgp.end())
  .catch((error) => {
    console.error('\n' + '-'.repeat(64));
    console.error('MIGRACION FALLIDA');
    console.error('-'.repeat(64));
    console.error(explain(error));
    console.error('-'.repeat(64));
    // El codigo de salida es lo que corta `npm run dev`: sin esto la aplicacion
    // arrancaria contra un esquema que no corresponde.
    console.error('No se levantara la aplicacion contra un esquema incorrecto.\n');
    pgp.end();
    process.exit(1);
  });
