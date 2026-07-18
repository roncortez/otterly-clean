const express = require('express');
const router = express.Router();
const direccionesController = require('../controllers/direccionesController');

router.get('/direcciones', direccionesController.obtenerDirecciones);
module.exports = router;