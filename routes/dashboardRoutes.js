const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', requireAuth, asyncHandler(dashboardController.show));

module.exports = router;
