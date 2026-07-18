// controllers/menuController.js
const { getMenu, getPlateById, searchPlates, subirPlato, editarPlato, borrarPlato } = require('../models/menuModel');
const cloudinary = require('../cloudinary');
const sharp = require('sharp');
const stream = require('stream');

const uploadImage = async (file) => {
  const resizedBuffer = await sharp(file.buffer)
    .resize(400)
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

const menuController = {
  getMenu: async (req, res) => {
    try {
      const menu = await getMenu();
      res.json(menu);
    } catch (error) {
      console.error('Error al obtener el menu:', error);
      res.status(500).json({ message: 'Error al obtener el menu' });
    }
  },

  getPlateById: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'Id invalido' });
      }

      const plate = await getPlateById(id);
      if (!plate) {
        return res.status(404).json({ message: 'Plato no encontrado' });
      }

      res.json(plate);
    } catch (error) {
      console.error(`Error al obtener el plato con id ${req.params.id}:`, error);
      res.status(500).json({ message: 'Error al obtener plato' });
    }
  },

  searchPlates: async (req, res) => {
    const { term = '' } = req.query;
    try {
      const result = term.trim() ? await searchPlates(term.trim()) : await getMenu();
      res.json(result);
    } catch (error) {
      console.error('Error al buscar en el menu:', error);
      res.status(500).json({ message: 'Error al buscar en el menu' });
    }
  },

  subirPlato: async (req, res) => {
    const { nombre, descripcion, precio, tipo_id, tipo_combinacion } = req.body;

    try {
      if (!nombre || !descripcion || !precio || !tipo_id) {
        return res.status(400).json({ message: 'Nombre, descripcion, precio y tipo son requeridos' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Imagen no proporcionada' });
      }

      const imageUrl = await uploadImage(req.file);
      const plato = await subirPlato(nombre, descripcion, precio, tipo_id, imageUrl, tipo_combinacion || null);
      res.status(201).json({ plato });
    } catch (error) {
      console.error('Error al subir plato:', error);
      res.status(500).json({ message: 'Error al subir plato' });
    }
  },

  editarPlato: async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { nombre, descripcion, precio, tipo_id, tipo_combinacion, tipo_ingrediente } = req.body;

    try {
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'ID no valido' });
      }

      if (!nombre || !descripcion || !precio || !tipo_id) {
        return res.status(400).json({ message: 'Nombre, descripcion, precio y tipo son requeridos' });
      }

      const existingPlate = await getPlateById(id);
      if (!existingPlate) {
        return res.status(404).json({ message: 'Plato no encontrado' });
      }

      const imageUrl = req.file ? await uploadImage(req.file) : existingPlate.image_url;
      const plato = await editarPlato(
        id,
        nombre,
        descripcion,
        precio,
        tipo_id,
        imageUrl,
        tipo_combinacion || null,
        tipo_ingrediente || null,
      );

      res.status(200).json({ plato });
    } catch (error) {
      console.error('Error al editar plato:', error);
      res.status(500).json({ message: 'Error al editar plato' });
    }
  },

  borrarPlato: async (req, res) => {
    const id = parseInt(req.params.id, 10);

    try {
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: 'ID no valido' });
      }

      const deleted = await borrarPlato(id);
      if (!deleted) {
        return res.status(404).json({ message: 'Plato no encontrado' });
      }

      res.status(200).json({ message: 'Plato eliminado con exito' });
    } catch (error) {
      console.error('Error al borrar plato:', error);
      res.status(500).json({ message: 'Error al eliminar el plato' });
    }
  }
};

module.exports = menuController;