const express = require('express');
const multer = require('multer');
const settingsController = require('../controllers/settingsController');

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get('/settings/banner', settingsController.getBanner);
router.get('/settings/operation', settingsController.getOperation);
router.put('/settings/operation', settingsController.updateOperation);
router.put('/settings/banner', upload.single('image'), settingsController.updateBanner);

module.exports = router;