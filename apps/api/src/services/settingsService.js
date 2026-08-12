'use strict';

const settingsRepo = require('../db/repositories/settingsRepository');

async function getBanner() {
  const banner = await settingsRepo.getSetting('banner');
  return banner || { enabled: false, imageUrl: '', message: '' };
}

async function updateBanner(data) {
  return settingsRepo.setSetting('banner', {
    enabled: data.enabled !== false,
    imageUrl: data.imageUrl || '',
    message: data.message || '',
    updatedAt: new Date().toISOString(),
  });
}

module.exports = { getBanner, updateBanner };
