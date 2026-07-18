const sharp = require('sharp');
const stream = require('stream');
const cloudinary = require('../cloudinary');
const { getBannerSettings, saveBannerSettings, getOperationSettings, saveOperationSettings } = require('../models/settingsModel');

const uploadImage = async (file) => {
  const resizedBuffer = await sharp(file.buffer)
    .resize(1200)
    .toBuffer();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream((error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result.secure_url);
    });

    const bufferStream = new stream.PassThrough();
    bufferStream.end(resizedBuffer);
    bufferStream.pipe(uploadStream);
  });
};

const settingsController = {
  getBanner: async (req, res) => {
    try {
      const banner = await getBannerSettings();
      res.json(banner);
    } catch (error) {
      console.error('Error al obtener banner:', error);
      res.status(500).json({ message: 'Error al obtener banner' });
    }
  },

  getOperation: async (req, res) => {
    try {
      const operation = await getOperationSettings();
      res.json(operation);
    } catch (error) {
      console.error('Error al obtener configuracion operativa:', error);
      res.status(500).json({ message: 'Error al obtener configuracion operativa' });
    }
  },

  updateOperation: async (req, res) => {
    try {
      const operation = await saveOperationSettings(req.body);
      res.json(operation);
    } catch (error) {
      console.error('Error al actualizar configuracion operativa:', error);
      res.status(500).json({ message: 'Error al actualizar configuracion operativa' });
    }
  },

  updateBanner: async (req, res) => {
    try {
      const { enabled, title, description, imageUrl } = req.body;
      const nextSettings = {
        enabled,
        title: title || '',
        description: description || '',
        imageUrl: imageUrl || ''
      };

      if (req.file) {
        nextSettings.imageUrl = await uploadImage(req.file);
      }

      const banner = await saveBannerSettings(nextSettings);
      res.json(banner);
    } catch (error) {
      console.error('Error al actualizar banner:', error);
      res.status(500).json({ message: 'Error al actualizar banner' });
    }
  }
};

module.exports = settingsController;