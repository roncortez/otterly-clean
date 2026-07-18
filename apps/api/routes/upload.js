const express = require('express');
const router = express.Router();
const cloudinary = require('../cloudinary');
const client = require('../db');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' }); // Multer configurado para guardar archivos temporalmente

// Ruta para subir un plato con imagen
router.post('/', upload.single('image'), async (req, res) => {
  const { name, description, price, type } = req.body;
  const tipo_id = parseInt(type, 10); // Asegúrate de que `type` se convierte a número entero
  // Validar que todos los campos están presentes
  if (!name || !description || !price || !type || !req.file) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
     // Redimensionar la imagen a 150x150 píxeles usando sharp
     const resizedImagePath = path.join('uploads', 'resized-' + req.file.filename);
     await sharp(req.file.path)
       .resize(400, 400) // Ajusta el tamaño deseado
       .toFile(resizedImagePath);
 
     // Subir la imagen redimensionada a Cloudinary
     const result = await cloudinary.uploader.upload(resizedImagePath);
     const imageUrl = result.secure_url;
 
     // Eliminar archivos temporales
     fs.unlinkSync(req.file.path);
     fs.unlinkSync(resizedImagePath);
 

    // Guardar todos los datos del plato en la base de datos
    const query = 'INSERT INTO menu (nombre, descripcion, precio, tipo_id, image_url) VALUES ($1, $2, $3, $4, $5)';
    const values = [name, description, price, type, imageUrl];
    await client.query(query, values);

    res.json({ message: 'Plato subido exitosamente', imageUrl });
    console.log('Plato subido correctamente');
  } catch (error) {
    console.error('Error al subir el plato:', error);
    res.status(500).json({ error: 'Error al subir el plato' });
  }
});

// Ruta para obtener todos los platos
router.get('/', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM menu');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener los platos:', error);
    res.status(500).json({ error: 'Error al obtener los platos' });
  }
});

module.exports = router;
