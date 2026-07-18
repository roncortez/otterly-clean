// routes/menuRoutes.js
const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController');
const cloudinary = require('../cloudinary');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage }); // Multer configurado para guardar archivos temporalmente

// Ruta para obtener todos los platos
router.get('/menu', menuController.getMenu);

// Ruta para obtener el plato según el ID
router.get("/menu/:id", menuController.getPlateById);

// Ruta para obtener plato segun termino de busqueda
router.get("/search", menuController.searchPlates);

// Ruta para subir un plato
router.post('/menu/plato', upload.single('image_url'), menuController.subirPlato);

//Ruta para editar un plato
router.put('/menu/plato/:id', upload.single('image_url'), menuController.editarPlato);

//Ruta para borrar un plato
router.delete('/menu/plato/:id', menuController.borrarPlato);
module.exports = router;
