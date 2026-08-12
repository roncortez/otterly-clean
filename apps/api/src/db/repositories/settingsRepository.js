'use strict';

const { db } = require('../index');

async function getSetting(key, tx = db) {
  const row = await tx.oneOrNone('SELECT value FROM app_settings WHERE key = $1', [key]);
  return row ? row.value : null;
}

async function setSetting(key, value, tx = db) {
  return tx.one(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2:json, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     RETURNING key, value`,
    [key, value],
  );
}

module.exports = { getSetting, setSetting };
