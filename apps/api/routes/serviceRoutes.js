const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');

// Public
router.get('/services', serviceController.getAllServices);
router.get('/services/:id', serviceController.getServiceById);
router.get('/property-types', serviceController.getPropertyTypes);

// Admin
router.post('/admin/services', serviceController.createService);
router.put('/admin/services/:id', serviceController.updateService);
router.delete('/admin/services/:id', serviceController.deleteService);

module.exports = router;
