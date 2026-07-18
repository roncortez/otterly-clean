const express = require('express');
const cuponController = require('../controllers/cuponController');

const router = express.Router();

// Admin routes
router.post('/cupones', cuponController.crear);
router.get('/cupones', cuponController.listar);
router.get('/cupones/:id', cuponController.obtenerPorId);
router.put('/cupones/:id', cuponController.actualizar);
router.delete('/cupones/:id', cuponController.eliminar);

// Asignación
router.post('/cupones/asignar', cuponController.asignarAUsuario);
router.post('/cupones/asignar-todos', cuponController.asignarATodos);
router.get('/cupones/buscar-usuarios', cuponController.buscarUsuarios);

// Cliente routes
router.post('/cupones/validar', cuponController.validar);
router.post('/cupones/registrar-uso', cuponController.registrarUsoPostPedido);
router.get('/cupones/mis-cupones', cuponController.misCupones);

module.exports = router;
