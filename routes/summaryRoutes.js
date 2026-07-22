const express = require('express');
const router = express.Router();
const summaryController = require('../controllers/summaryController');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.get('/summary', requireAuth, asyncHandler(summaryController.show));

module.exports = router;
