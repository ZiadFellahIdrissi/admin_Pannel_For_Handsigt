const express = require('express');
const router = express.Router();
const loginAttemptsController = require('../controllers/loginAttemptsController');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

// Read-only: no POST routes on this router at all.
router.get('/login-attempts', requireAuth, asyncHandler(loginAttemptsController.list));

module.exports = router;
