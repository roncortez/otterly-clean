// routes/categoriaRoutes.js
const express = require('express');
const router = express.Router();
const categoriaController = require('../controllers/categoriaController');

router.get('/api/categorias', categoriaController.getAllCategorias);

module.exports = router;

