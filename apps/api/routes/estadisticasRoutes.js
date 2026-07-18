const estadisticasController = require('../controllers/estadisticasController');
const express = require('express');
const router = express.Router();

router.get('/estadisticas/dia/:fecha', estadisticasController.obtenerResumenDia);

module.exports = router;
