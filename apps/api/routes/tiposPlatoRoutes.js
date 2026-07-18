const tiposPlatoController = require('../controllers/tiposPlatoController');
const express = require('express');
const router = express.Router();

router.get('/tipos-plato', tiposPlatoController.obtenerTiposPlato);

module.exports = router;
