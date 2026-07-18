const express = require('express');
const adminOrderController = require('../controllers/adminOrderController');

const router = express.Router();

router.get('/admin/tables', adminOrderController.getTables);
router.get('/admin/orders/open', adminOrderController.getOpenOrders);
router.post('/admin/orders', adminOrderController.createOrder);
router.patch('/admin/orders/:id/status', adminOrderController.updateOrderStatus);

module.exports = router;
