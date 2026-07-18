const db = require('../db');

const DEFAULT_BANNER_SETTINGS = {
  enabled: false,
  title: 'Promocion del dia',
  description: 'Disfruta nuestros platos favoritos preparados al momento.',
  imageUrl: ''
};

const DEFAULT_OPERATION_SETTINGS = {
  acceptOrders: true,
  freeDelivery: false,
  notifyTelegram: true,
  highlightDelivery: true
};

const ensureSettingsTable = async () => {
  await db.none(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
};

const getSetting = async (key, defaultValue) => {
  await ensureSettingsTable();
  const row = await db.oneOrNone('SELECT value FROM app_settings WHERE key = $1', [key]);
  return row ? row.value : defaultValue;
};

const saveSetting = async (key, value) => {
  await ensureSettingsTable();
  return db.one(
    `INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      RETURNING value`,
    [key, value]
  );
};

const toBoolean = (value, fallback) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
};

const getBannerSettings = async () => {
  const settings = await getSetting('banner', DEFAULT_BANNER_SETTINGS);
  return { ...DEFAULT_BANNER_SETTINGS, ...settings };
};

const saveBannerSettings = async (settings) => {
  const currentSettings = await getBannerSettings();
  const nextSettings = {
    ...currentSettings,
    ...settings,
    enabled: toBoolean(settings.enabled, currentSettings.enabled)
  };

  const result = await saveSetting('banner', nextSettings);
  return { ...DEFAULT_BANNER_SETTINGS, ...result.value };
};

const getOperationSettings = async () => {
  const settings = await getSetting('operation', DEFAULT_OPERATION_SETTINGS);
  return { ...DEFAULT_OPERATION_SETTINGS, ...settings };
};

const saveOperationSettings = async (settings = {}) => {
  const currentSettings = await getOperationSettings();
  const nextSettings = {
    ...currentSettings,
    acceptOrders: toBoolean(settings.acceptOrders, currentSettings.acceptOrders),
    freeDelivery: toBoolean(settings.freeDelivery, currentSettings.freeDelivery),
    notifyTelegram: toBoolean(settings.notifyTelegram, currentSettings.notifyTelegram),
    highlightDelivery: toBoolean(settings.highlightDelivery, currentSettings.highlightDelivery)
  };

  const result = await saveSetting('operation', nextSettings);
  return { ...DEFAULT_OPERATION_SETTINGS, ...result.value };
};

module.exports = {
  DEFAULT_BANNER_SETTINGS,
  DEFAULT_OPERATION_SETTINGS,
  getBannerSettings,
  saveBannerSettings,
  getOperationSettings,
  saveOperationSettings
};
