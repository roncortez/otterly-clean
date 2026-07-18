// controllers/categoriaController.js
const db = require('../db');

exports.getAllCategorias = async (req, res) => {
  try {
    const categorias = await db.any('SELECT * FROM tipos');
    res.json(categorias);
  } catch (error) {
    console.error('Error al obtener las categorías:', error);
    res.status(500).json({ error: 'Hubo un problema al obtener las categorías.' });
  }
};

