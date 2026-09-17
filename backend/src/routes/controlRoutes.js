const express = require('express');
const router = express.Router();
const { validatePitchCommand } = require('../middleware/validation');
const controlController = require('../controllers/controlController');

// POST /api/control/pitch — command a blade pitch angle
router.post('/pitch', validatePitchCommand, controlController.setPitch);

// GET /api/control/pitch — last accepted command, limits, and target
router.get('/pitch', controlController.getPitch);

module.exports = router;
