//authRoutes.js
const db = require('../db'); // Ajusta según la configuración de tu cliente de PostgreSQL

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Ruta para registrar un nuevo usuario 
router.post('/auth/register', authController.registerUser);
router.post('/auth/getUserRole', authController.getUserRole);
router.post('/auth/getUser', authController.getUser);
router.get('/auth/users', authController.getUsers);
router.put('/auth/users/:id', authController.updateUser);


module.exports = router;
