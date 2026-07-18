const express = require('express');
const router = express.Router();
const client = require('../db');

// Ruta para obtener todos los tipos
router.get('/tipos', async (req, res) => {
    try {
      const result = await client.query('SELECT * FROM tipos');
      res.json(result); // Debería ser un array
    } catch (error) {
      console.error('Error al obtener los tipos:', error);
      res.status(500).json({ error: 'Error al obtener los tipos' });
    }
});

module.exports = router;