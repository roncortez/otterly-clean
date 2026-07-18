// routes/categoriaRoutes.js
const express = require('express');
const ingredientController = require('../controllers/ingredientController');
const router = express.Router();

// Ruta para obtener ingredientes
router.get('/ingredients', ingredientController.getIngredient);

module.exports = router;
