const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');

router.get('/pedido', pedidoController.obtenerPedidos);
router.get('/pedido/detalle-pedido/:id', pedidoController.obtenerDetallePedidos);
router.get('/pedido/:id', pedidoController.obtenerPedidosUsuario);
router.post('/pedido', pedidoController.enviarPedido);
router.post('/pedido/detalle-pedido', pedidoController.enviarDetallePedido);

module.exports = router;

