const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Customer
router.post('/orders', orderController.createOrder);
router.get('/orders/mine/:customerId', orderController.getMyOrders);
router.get('/orders/:id', orderController.getOrderById);

// Admin
router.get('/admin/orders', orderController.getAllOrders);
router.patch('/admin/orders/:id/status', orderController.updateStatus);
router.patch('/admin/orders/:id/quoted-price', orderController.setQuotedPrice);
router.post('/admin/orders/:id/photos', orderController.addPhoto);
router.get('/admin/dashboard/:date?', orderController.getDashboard);

module.exports = router;
