const express = require('express');
const router = express.Router();
const loginAttemptsController = require('../controllers/loginAttemptsController');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

// Read-only: no POST routes on this router at all.
router.get('/login-attempts/consultants', requireAuth, asyncHandler(loginAttemptsController.listConsultants));
router.get('/login-attempts/admin', requireAuth, asyncHandler(loginAttemptsController.listAdmin));
router.get('/login-attempts/analysis', requireAuth, asyncHandler(loginAttemptsController.showAnalysis));

// Old single-page URL - kept as a redirect so any existing bookmark still works.
router.get('/login-attempts', requireAuth, (req, res) => res.redirect('/login-attempts/consultants'));

module.exports = router;
